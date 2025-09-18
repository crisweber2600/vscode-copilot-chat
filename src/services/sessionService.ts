import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import {
  type AgentSession,
  type AgentSessionStatus,
  type DelegationRequest,
  type FollowEvent,
  type RepositoryMetadata,
  createSessionRecord,
} from '../models/cliDelegation';
import { ConflictError, NotFoundError } from './errors';
import { AuthService } from './authService';
import {
  CopilotAgentClient,
  type CreateJobPayload,
  type RemoteJobInfo,
  type RemoteSession,
  mapRemoteStatus,
} from './copilotAgentClient';
import { GitError, GitService } from './gitService';

function envTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

export type RunnerMode = 'cli' | 'stub';

export interface SessionServiceOptions {
  agentHome: string;
  now?: () => Date;
  runnerMode?: RunnerMode;
  authService?: AuthService;
  clientFactory?: (token: string) => CopilotAgentClient;
}

const SESSIONS_FILE = 'sessions.json';
const TERMINAL_STATES: AgentSessionStatus[] = ['completed', 'failed', 'cancelled'];

export class SessionService {
  private readonly sessionsPath: string;
  private readonly now: () => Date;
  private readonly runnerMode: RunnerMode;
  private readonly authService?: AuthService;
  private readonly clientFactory?: (token: string) => CopilotAgentClient;

  constructor(private readonly options: SessionServiceOptions) {
    this.sessionsPath = join(options.agentHome, SESSIONS_FILE);
    this.now = options.now ?? (() => new Date());
    const envRunner = process.env.COPILOT_AGENT_RUNNER_MODE as RunnerMode | undefined;
    const defaultMode: RunnerMode = process.env.COPILOT_CLI_TEST_MODE ? 'stub' : 'cli';
    this.runnerMode = envRunner ?? options.runnerMode ?? defaultMode;
    this.authService = options.authService;
    this.clientFactory = options.clientFactory;
  }

  private autoCommitEnabled(): boolean {
    return envTruthy(process.env.COPILOT_CLI_AUTO_COMMIT_AND_PUSH);
  }

  private autoCommitMessage(): string {
    return process.env.COPILOT_CLI_AUTO_COMMIT_MESSAGE?.trim() || 'Checkpoint from Copilot CLI for coding agent session';
  }

  private resolveRemoteName(repository: RepositoryMetadata): string {
    return repository.remoteName?.trim() || process.env.COPILOT_CLI_REMOTE_NAME?.trim() || 'origin';
  }

  private isRemoteMode(): boolean {
    return this.runnerMode === 'cli';
  }

  isRemote(): boolean {
    return this.isRemoteMode();
  }

  private async createClient(existing?: CopilotAgentClient): Promise<CopilotAgentClient> {
    if (existing) {
      return existing;
    }
    if (!this.authService) {
      throw new Error('Auth service unavailable; cannot contact coding agent.');
    }
    const token = await this.authService.getAccessToken();
    return this.clientFactory ? this.clientFactory(token) : new CopilotAgentClient({ token });
  }

  async create(request: DelegationRequest): Promise<AgentSession> {
    const sessions = await this.readSessions();
    const id = randomUUID();
    const session = createSessionRecord(request, id);
    sessions.push(session);
    await this.writeSessions(sessions);
    this.startProcessingTask(session, request).catch(() => {
      // errors handled inside; ensure no unhandled rejection
    });
    return this.normalizeSession(session);
  }

  async get(id: string): Promise<AgentSession> {
    const session = await this.findLocalSession(id);
    if (!session) {
      throw new NotFoundError(`Session ${id} not found.`);
    }
    if (this.isRemoteMode()) {
      return this.syncSessionFromRemote(session);
    }
    return this.normalizeSession(session);
  }

  async list(filter?: { status?: AgentSessionStatus }): Promise<AgentSession[]> {
    const sessions = await this.readSessions();
    const resolved = this.isRemoteMode()
      ? await Promise.all(sessions.map((session) => this.syncSessionFromRemote(session)))
      : sessions.map((session) => this.normalizeSession(session));

    if (!filter?.status) {
      return resolved;
    }

    return resolved.filter((session) => session.status === filter.status);
  }

  async cancel(id: string): Promise<AgentSession> {
    const session = await this.get(id);
    if (!session) {
      throw new NotFoundError(`Session ${id} not found.`);
    }

    if (session.status === 'cancelled') {
      return this.normalizeSession(session);
    }

    if (TERMINAL_STATES.includes(session.status)) {
      throw new ConflictError(`Cannot cancel session ${id} in ${session.status} state.`);
    }

    if (this.isRemoteMode() && session.remoteSessionId && session.repository) {
      await this.cancelRemoteSession(session);
    }

    session.status = 'cancelled';
    session.updatedAt = this.now().toISOString();
    session.needsUserInput = false;
    session.events = session.events ?? [];
    session.events.push({
      type: 'status',
      status: 'cancelled',
      timestamp: session.updatedAt,
      sessionId: session.id,
    });

    await this.updateSession(session);
    return this.normalizeSession(session);
  }

  async getResult(id: string): Promise<Pick<AgentSession, 'id' | 'status' | 'summary' | 'artifacts'>> {
    const session = await this.get(id);
    if (!TERMINAL_STATES.includes(session.status)) {
      throw new ConflictError(`Session ${id} is not finished.`);
    }
    return {
      id: session.id,
      status: session.status,
      summary: session.summary ?? '',
      artifacts: Array.isArray(session.artifacts) ? [...session.artifacts] : [],
    };
  }

  async getFollowEvents(id: string): Promise<FollowEvent[]> {
    const local = await this.findLocalSession(id);
    if (!local) {
      throw new NotFoundError(`Session ${id} not found.`);
    }
    const session = this.isRemoteMode()
      ? await this.syncSessionFromRemote(local, { includeLogs: true })
      : this.normalizeSession(local);
    return Array.isArray(session.events) ? [...session.events] : [];
  }

  async updateSession(partial: AgentSession): Promise<void> {
    const sessions = await this.readSessions();
    const index = sessions.findIndex((entry) => entry.id === partial.id);
    if (index === -1) {
      throw new NotFoundError(`Session ${partial.id} not found.`);
    }
    sessions[index] = partial;
    await this.writeSessions(sessions);
  }

  private async readSessions(): Promise<AgentSession[]> {
    try {
      const raw = await fs.readFile(this.sessionsPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed as AgentSession[];
      }
      return [];
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async writeSessions(sessions: AgentSession[]): Promise<void> {
    await fs.mkdir(this.options.agentHome, { recursive: true });
    await fs.writeFile(this.sessionsPath, JSON.stringify(sessions, null, 2), 'utf8');
  }

  private normalizeSession(session: AgentSession): AgentSession {
    return {
      ...session,
      artifacts: Array.isArray(session.artifacts) ? [...session.artifacts] : [],
      events: Array.isArray(session.events) ? [...session.events] : [],
      repository: session.repository ? { ...session.repository } : undefined,
    };
  }

  private async findLocalSession(id: string): Promise<AgentSession | undefined> {
    const sessions = await this.readSessions();
    return sessions.find((entry) => entry.id === id);
  }

  private async syncSessionFromRemote(
    session: AgentSession,
    options: { includeLogs?: boolean; client?: CopilotAgentClient } = {}
  ): Promise<AgentSession> {
    if (!this.isRemoteMode() || !session.remoteSessionId || !session.repository) {
      return this.normalizeSession(session);
    }

    let client: CopilotAgentClient;
    try {
      client = await this.createClient(options.client);
    } catch (error) {
      return this.normalizeSession(session);
    }

    let remoteSession: RemoteSession | undefined;
    let remoteJob: RemoteJobInfo | undefined;
    const errors: string[] = [];

    try {
      remoteSession = await client.getSession(session.remoteSessionId);
    } catch (error) {
      errors.push(`Failed to fetch remote session: ${(error as Error).message}`);
    }

    try {
      remoteJob = await client.getJob(session.repository.owner, session.repository.repo, session.remoteSessionId);
    } catch (error) {
      errors.push(`Failed to fetch remote job: ${(error as Error).message}`);
    }

    let events = Array.isArray(session.events) ? [...session.events] : [];
    const lastStatus = [...events].reverse().find((event) => event.type === 'status') as
      | { status: AgentSessionStatus }
      | undefined;
    const mappedStatus = mapRemoteStatus(remoteSession?.state ?? remoteJob?.status);
    if (mappedStatus && (!lastStatus || lastStatus.status !== mappedStatus)) {
      events = this.appendEvent({ ...session, events }, {
        type: 'status',
        status: mappedStatus,
        timestamp: remoteSession?.last_updated_at ?? this.now().toISOString(),
        sessionId: session.id,
      });
    }

    if (options.includeLogs && session.remoteSessionId) {
      try {
        const logs = await client.getSessionLogs(session.remoteSessionId);
        const existingLogs = new Set(
          events.filter((event): event is FollowEvent & { message: string } => event.type === 'log').map((event) => event.message)
        );
        logs
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .forEach((line) => {
            if (!existingLogs.has(line)) {
              events.push({
                type: 'log',
                message: line,
                sessionId: session.id,
                timestamp: this.now().toISOString(),
              });
              existingLogs.add(line);
            }
          });
      } catch (error) {
        errors.push(`Failed to stream remote logs: ${(error as Error).message}`);
      }
    }

    if (errors.length > 0) {
      const existingLogs = new Set(
        events.filter((event): event is FollowEvent & { message: string } => event.type === 'log').map((event) => event.message)
      );
      errors.forEach((message) => {
        if (!existingLogs.has(message)) {
          events.push({
            type: 'log',
            message,
            sessionId: session.id,
            timestamp: this.now().toISOString(),
          });
        }
      });
    }

    let summary = session.summary ?? '';
    if (remoteJob?.problem_statement) {
      summary = remoteJob.problem_statement;
    }

    let artifacts = Array.isArray(session.artifacts) ? [...session.artifacts] : [];
    const prUrl = remoteJob?.pull_request?.html_url ?? session.pullRequestUrl;
    if (prUrl && !artifacts.includes(prUrl)) {
      artifacts.push(prUrl);
    }

    const updated: AgentSession = {
      ...session,
      status: mappedStatus ?? session.status,
      summary,
      artifacts,
      needsUserInput: false,
      events,
      updatedAt: remoteSession?.last_updated_at ?? this.now().toISOString(),
      pullRequestUrl: prUrl,
      pullRequestNumber: remoteJob?.pull_request?.number ?? session.pullRequestNumber,
    };

    await this.updateSession(updated);
    return this.normalizeSession(updated);
  }

  private async startProcessingTask(session: AgentSession, request: DelegationRequest): Promise<void> {
    if (this.runnerMode === 'stub') {
      await this.simulateLifecycle(session.id);
      return;
    }

    try {
      await this.runRemoteSession(session, request);
    } catch (error) {
      const message = `Job runner error: ${(error as Error).message}`;
      const current = await this.get(session.id);
      const logEvent: FollowEvent = {
        type: 'log',
        message,
        timestamp: this.now().toISOString(),
        sessionId: session.id,
      };
      const eventsWithLog = this.appendEvent(current, logEvent);
      const completionEvent: FollowEvent = {
        type: 'status',
        status: 'failed',
        timestamp: this.now().toISOString(),
        sessionId: session.id,
      };
      await this.updateSessionState(session.id, {
        status: 'failed',
        summary: message,
        artifacts: [],
        needsUserInput: false,
        events: [...eventsWithLog, completionEvent],
      });
    }
  }

  private async simulateLifecycle(sessionId: string): Promise<void> {
    // Intentionally no-op; contract tests mutate session state manually.
    return;
  }

  private appendEvent(session: AgentSession, event: FollowEvent): FollowEvent[] {
    const existing = Array.isArray(session.events) ? [...session.events] : [];
    existing.push(event);
    return existing;
  }

  private async updateSessionState(
    sessionId: string,
    update: Partial<AgentSession> & { events?: FollowEvent[] }
  ): Promise<void> {
    const sessions = await this.readSessions();
    const session = sessions.find((entry) => entry.id === sessionId);
    if (!session) {
      return;
    }

    if (update.status) {
      session.status = update.status;
    }
    if (update.summary !== undefined) {
      session.summary = update.summary;
    }
    if (update.artifacts) {
      session.artifacts = update.artifacts;
    }
    if (update.needsUserInput !== undefined) {
      session.needsUserInput = update.needsUserInput;
    }
    if (update.events) {
      session.events = update.events;
    }
    if (Object.prototype.hasOwnProperty.call(update, 'remoteSessionId')) {
      session.remoteSessionId = update.remoteSessionId;
    }
    if (Object.prototype.hasOwnProperty.call(update, 'pullRequestUrl')) {
      session.pullRequestUrl = update.pullRequestUrl;
    }
    if (Object.prototype.hasOwnProperty.call(update, 'pullRequestNumber')) {
      session.pullRequestNumber = update.pullRequestNumber;
    }
    session.updatedAt = this.now().toISOString();

    await this.writeSessions(sessions);
  }

  private async runRemoteSession(session: AgentSession, request: DelegationRequest): Promise<void> {
    if (!request.repository) {
      throw new Error('Repository information is required to delegate to the coding agent.');
    }

    const repository: RepositoryMetadata = { ...request.repository };
    const autoCommitLogs: string[] = [];

    if (repository.workspacePath) {
      try {
        const git = new GitService({ cwd: repository.workspacePath });
        const remoteName = this.resolveRemoteName(repository);
        const branchExists = await git.remoteBranchExists(remoteName, repository.branch);
        const autoCommit = this.autoCommitEnabled();

        if (!branchExists) {
          if (autoCommit) {
            await git.pushBranch(remoteName, repository.branch);
            autoCommitLogs.push(`Pushed ${repository.branch} to ${remoteName} because it was missing.`);
          } else {
            throw new Error(
              `The branch "${repository.branch}" does not exist on remote "${remoteName}". Push the branch before delegating or set COPILOT_CLI_AUTO_COMMIT_AND_PUSH=1.`
            );
          }
        }

        const hasChanges = await git.hasUncommittedChanges();
        if (hasChanges) {
          if (!autoCommit) {
            throw new Error(
              'Uncommitted changes detected. Commit or stash them before delegating, or enable automatic commits via COPILOT_CLI_AUTO_COMMIT_AND_PUSH=1.'
            );
          }
          const checkpoint = await git.createCheckpointBranch({
            remote: remoteName,
            commitMessage: this.autoCommitMessage(),
          });
          repository.headRef = checkpoint.headRef;
          autoCommitLogs.push(...checkpoint.log);
        }
      } catch (error) {
        if (error instanceof GitError) {
          throw new Error(error.message);
        }
        throw error;
      }
    }

    const logEvents: FollowEvent[] = autoCommitLogs.map((message) => ({
      type: 'log',
      message,
      timestamp: this.now().toISOString(),
      sessionId: session.id,
    }));

    let combinedEvents = Array.isArray(session.events) ? [...session.events] : [];
    if (logEvents.length > 0) {
      combinedEvents = [...combinedEvents, ...logEvents];
    }

    const runningEvent: FollowEvent = {
      type: 'status',
      status: 'running',
      timestamp: this.now().toISOString(),
      sessionId: session.id,
    };

    const runningEvents = this.appendEvent({ ...session, events: combinedEvents }, runningEvent);

    await this.updateSessionState(session.id, {
      status: 'running',
      needsUserInput: false,
      events: runningEvents,
    });

    session.events = runningEvents;
    session.status = 'running';

    const client = await this.createClient();

    const payload: CreateJobPayload = {
      prompt: request.prompt,
      summary: request.prompt,
      contextRefs: request.contextRefs,
      approvals: request.approvals,
      repository,
    };

    const jobResult = await client.createJob(payload);

    const latest = await this.findLocalSession(session.id);
    if (!latest) {
      return;
    }

    const artifacts = Array.isArray(latest.artifacts) ? [...latest.artifacts] : [];
    if (jobResult.pullRequestUrl && !artifacts.includes(jobResult.pullRequestUrl)) {
      artifacts.push(jobResult.pullRequestUrl);
    }

    const eventsWithLog = this.appendEvent(latest, {
      type: 'log',
      message: jobResult.pullRequestUrl
        ? `Created coding agent session ${jobResult.sessionId}. Pull request ready at ${jobResult.pullRequestUrl}.`
        : `Created coding agent session ${jobResult.sessionId}.`,
      timestamp: this.now().toISOString(),
      sessionId: session.id,
    });

    const updated: AgentSession = {
      ...latest,
      artifacts,
      events: eventsWithLog,
      remoteSessionId: jobResult.sessionId,
      pullRequestUrl: jobResult.pullRequestUrl ?? latest.pullRequestUrl,
      pullRequestNumber: jobResult.pullRequestNumber ?? latest.pullRequestNumber,
      repository: repository ? { ...repository } : latest.repository,
    };

    await this.updateSession(updated);

    await this.pollRemoteAndSync(updated, client);
  }

  private async pollRemoteAndSync(session: AgentSession, client: CopilotAgentClient): Promise<void> {
    if (!session.remoteSessionId || !session.repository) {
      return;
    }

    const pollTimeoutMs = Number.parseInt(process.env.COPILOT_CLI_POLL_TIMEOUT_MS ?? '15000', 10);
    const pollIntervalMs = Number.parseInt(process.env.COPILOT_CLI_POLL_INTERVAL_MS ?? '2000', 10);
    const deadline = Date.now() + Math.max(1000, pollTimeoutMs);

    while (Date.now() < deadline) {
      try {
        const remote = await client.getSession(session.remoteSessionId);
        const mapped = mapRemoteStatus(remote?.state);
        if (mapped !== 'queued') {
          break;
        }
      } catch {
        break;
      }
      await delay(Math.max(250, pollIntervalMs));
    }

    await this.syncSessionFromRemote(session, { client });
  }

  private async cancelRemoteSession(session: AgentSession): Promise<void> {
    const client = await this.createClient();

    let workflowRunId: number | undefined;
    try {
      const remote = session.remoteSessionId ? await client.getSession(session.remoteSessionId) : undefined;
      workflowRunId = remote?.workflow_run_id ?? undefined;
    } catch {
      workflowRunId = undefined;
    }

    if (!workflowRunId && session.repository && session.remoteSessionId) {
      try {
        const job = await client.getJob(session.repository.owner, session.repository.repo, session.remoteSessionId);
        workflowRunId = job?.workflow_run?.id;
      } catch {
        workflowRunId = undefined;
      }
    }

    if (!workflowRunId || !session.repository) {
      throw new Error('Unable to identify remote workflow for cancellation.');
    }

    await client.cancelWorkflowRun(session.repository.owner, session.repository.repo, workflowRunId);

    await this.syncSessionFromRemote(session, { client });
  }
}
