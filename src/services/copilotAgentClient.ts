import { relative, isAbsolute, sep } from 'node:path';
import type { AgentSessionStatus, RepositoryMetadata } from '../models/cliDelegation';

const DEFAULT_BASE_URL = 'https://api.githubcopilot.com';
const DEFAULT_INTEGRATION_ID = 'copilot-developer-dev';
const EVENT_TYPE = 'visual_studio_code_remote_agent_tool_invoked';
const BODY_SUFFIX = 'Created from VS Code via the [GitHub Pull Request](https://marketplace.visualstudio.com/items?itemName=GitHub.vscode-pull-request-github) extension.';

export interface CopilotAgentClientOptions {
  token: string;
  baseUrl?: string;
  integrationId?: string;
  fetchImpl?: typeof fetch;
}

export interface CreateJobPayload {
  prompt: string;
  summary?: string;
  contextRefs: string[];
  approvals: string[];
  repository: RepositoryMetadata;
}

export interface CreateJobResult {
  sessionId: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

export interface RemoteSession {
  id: string;
  state: 'completed' | 'in_progress' | 'failed' | 'queued';
  last_updated_at: string;
  created_at: string;
  completed_at?: string;
  workflow_run_id?: number;
  error?: string | null;
}

export interface RemoteJobInfo {
  job_id: string;
  session_id: string;
  status: string;
  problem_statement: string;
  updated_at: string;
  created_at: string;
  pull_request?: {
    id: number;
    number: number;
    html_url: string;
  };
  workflow_run?: {
    id: number;
  };
  error?: {
    message: string;
  };
}

interface RemoteAgentJobResponse {
  pull_request: {
    html_url: string;
    number: number;
  };
  session_id: string;
}

interface RemoteAgentSessionsResponse {
  sessions: RemoteSession[];
}

export class CopilotAgentClient {
  private readonly baseUrl: string;
  private readonly integrationId: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: CopilotAgentClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.integrationId = options.integrationId ?? DEFAULT_INTEGRATION_ID;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async createJob(payload: CreateJobPayload): Promise<CreateJobResult> {
    const requestBody = this.buildJobPayload(payload);
    const url = this.composeUrl(`/agents/swe/v0/jobs/${payload.repository.owner}/${payload.repository.repo}`);
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Copilot-Integration-Id': this.integrationId,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(await this.formatRemoteAgentError(response));
    }

    const data = (await response.json()) as RemoteAgentJobResponse;
    if (!data?.session_id) {
      throw new Error('Remote agent response did not include a session identifier.');
    }

    return {
      sessionId: data.session_id,
      pullRequestUrl: data.pull_request?.html_url,
      pullRequestNumber: data.pull_request?.number,
    };
  }

  async getSession(sessionId: string): Promise<RemoteSession> {
    const url = this.composeUrl(`/agents/sessions/${sessionId}`);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch session ${sessionId}: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as RemoteSession;
  }

  async listSessions(): Promise<RemoteSession[]> {
    const url = this.composeUrl('/agents/sessions');
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as RemoteAgentSessionsResponse;
    return Array.isArray(data.sessions) ? data.sessions : [];
  }

  async getJob(owner: string, repo: string, sessionId: string): Promise<RemoteJobInfo | undefined> {
    const url = this.composeUrl(`/agents/swe/v0/jobs/${owner}/${repo}/session/${sessionId}`);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders(),
    });

    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as RemoteJobInfo;
  }

  async getSessionLogs(sessionId: string): Promise<string> {
    const url = this.composeUrl(`/agents/sessions/${sessionId}/logs`);
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: this.defaultHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch session logs: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  async cancelWorkflowRun(owner: string, repo: string, workflowRunId: number): Promise<void> {
    const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${workflowRunId}/cancel`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'copilot-cli',
      },
    });

    if (response.status === 202 || response.status === 204) {
      return;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to cancel workflow run ${workflowRunId}: ${response.status} ${response.statusText} ${body}`);
    }
  }

  private defaultHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.options.token}`,
      'Accept': 'application/json',
      'Copilot-Integration-Id': this.integrationId,
    };
  }

  private composeUrl(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private buildJobPayload(payload: CreateJobPayload) {
    const problemContext = this.buildProblemContext(payload);
    const title = this.deriveTitle(payload.prompt);
    return {
      problem_statement: problemContext,
      event_type: EVENT_TYPE,
      pull_request: {
        title,
        body_placeholder: this.buildBodyPlaceholder(title, problemContext),
        body_suffix: BODY_SUFFIX,
        base_ref: payload.repository.branch,
        ...(payload.repository.headRef ? { head_ref: payload.repository.headRef } : {}),
      },
    };
  }

  private deriveTitle(prompt: string): string {
    const trimmed = prompt.trim();
    if (trimmed.length <= 120) {
      return trimmed;
    }
    return `${trimmed.slice(0, 117)}...`;
  }

  private buildProblemContext(payload: CreateJobPayload): string {
    const lines: string[] = [payload.prompt.trim()];
    if (payload.summary && payload.summary.trim().length > 0 && payload.summary.trim() !== payload.prompt.trim()) {
      lines.push('', payload.summary.trim());
    }
    if (payload.contextRefs.length > 0) {
      lines.push('', 'Context references:');
      payload.contextRefs.forEach((ref) => {
        lines.push(`- ${this.formatContextRef(ref, payload.repository.workspacePath)}`);
      });
    }
    if (payload.approvals.length > 0) {
      lines.push('', 'Pre-approved actions:');
      payload.approvals.forEach((approval) => {
        lines.push(`- ${approval}`);
      });
    }
    lines.push('', `Repository: ${payload.repository.owner}/${payload.repository.repo} (${payload.repository.branch})`);
    if (payload.repository.remoteUrl) {
      lines.push(`Remote: ${payload.repository.remoteUrl}`);
    }
    return lines.join('\n');
  }

  private formatContextRef(ref: string, workspacePath?: string): string {
    if (!workspacePath || !isAbsolute(ref)) {
      return this.toPosix(ref);
    }
    try {
      const relativePath = relative(workspacePath, ref);
      if (!relativePath || relativePath.startsWith('..')) {
        return this.toPosix(ref);
      }
      return this.toPosix(relativePath) || '.';
    } catch {
      return this.toPosix(ref);
    }
  }

  private toPosix(value: string): string {
    return value.split(sep).join('/');
  }

  private buildBodyPlaceholder(title: string, problemContext: string): string {
    const header = `Coding agent has begun work on **${title}** and will replace this description as work progresses.`;
    const collapsedContext = `<details><summary>See problem context</summary>\n\n${problemContext}\n\n</details>`;
    return `${header}\n\n${collapsedContext}`;
  }

  private async formatRemoteAgentError(response: Response): Promise<string> {
    const status = response.status;
    const body = await response.text();
    switch (status) {
      case 400:
        return 'Bad request when invoking coding agent.';
      case 401:
        return 'Authentication failed when contacting coding agent service. Run "copilot-cli login" again.';
      case 402:
        return 'Coding agent premium request quota exceeded.';
      case 403:
        return 'Coding agent is not enabled for this repository.';
      case 404:
        return 'Repository was not found or is inaccessible to the coding agent.';
      case 409:
        return 'A coding agent pull request already exists for this repository.';
      case 500:
        return 'Coding agent service reported an internal error. Please retry later.';
      default:
        return `Coding agent request failed (${status}): ${body || response.statusText}`;
    }
  }
}

export function mapRemoteStatus(remote?: string): AgentSessionStatus {
  switch (remote) {
    case 'in_progress':
      return 'running';
    case 'failed':
      return 'failed';
    case 'completed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'waiting':
      return 'waiting';
    case 'blocked':
      return 'blocked';
    case 'queued':
    default:
      return 'queued';
  }
}
