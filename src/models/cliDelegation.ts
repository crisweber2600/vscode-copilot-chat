export type DelegationOutputFormat = 'json' | 'text';
export type DelegationMode = 'interactive' | 'non-interactive';

export type AgentSessionStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface DelegationRequest {
  prompt: string;
  contextRefs: string[];
  mode: DelegationMode;
  approvals: string[];
  output: DelegationOutputFormat;
  quiet?: boolean;
  repository?: RepositoryMetadata;
}

export interface AgentSession {
  id: string;
  status: AgentSessionStatus;
  createdAt: string;
  updatedAt: string;
  needsUserInput: boolean;
  summary?: string;
  artifacts: string[];
  prompt: string;
  contextRefs: string[];
  approvals: string[];
  output: DelegationOutputFormat;
  events?: FollowEvent[];
  repository?: RepositoryMetadata;
  remoteSessionId?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
}

export interface ApprovalEvent {
  sessionId: string;
  requestType: string;
  description: string;
  decision: 'approve' | 'deny' | 'pending';
  actor: string;
  timestamp: string;
}

export type AuthMethod = 'device-code' | 'env-token';
export type AuthStatus = 'unauthenticated' | 'authenticated' | 'expired';

export interface AuthSession {
  method: AuthMethod;
  status: AuthStatus;
  expiresAt?: string;
  token?: string;
}

export interface FollowEventBase {
  timestamp: string;
  sessionId: string;
}

export interface StatusFollowEvent extends FollowEventBase {
  type: 'status';
  status: AgentSessionStatus;
}

export interface LogFollowEvent extends FollowEventBase {
  type: 'log';
  message: string;
}

export type FollowEvent = StatusFollowEvent | LogFollowEvent;

export interface AgentSessionStoreShape {
  sessions: AgentSession[];
}

export interface AuthStoreShape {
  session?: AuthSession;
}

export interface RepositoryMetadata {
  provider: 'github';
  owner: string;
  repo: string;
  branch: string;
  remoteUrl: string;
  workspacePath?: string;
  remoteName?: string;
  headRef?: string;
}

type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateDelegationRequest(request: DelegationRequest): ValidationResult {
  const prompt = request.prompt?.trim();
  if (!prompt) {
    return { valid: false, reason: 'Prompt is required.' };
  }

  if (prompt.length > 2048) {
    return { valid: false, reason: 'Prompt must be 2048 characters or fewer.' };
  }

  if (!Array.isArray(request.contextRefs)) {
    return { valid: false, reason: 'Context references must be an array.' };
  }

  if (request.mode === 'non-interactive' && request.approvals.length === 0) {
    return {
      valid: false,
      reason: 'Non-interactive delegations require explicit approvals or override flags.',
    };
  }

  return { valid: true };
}

type PathExists = (path: string) => boolean;

export function validateContextRefs(refs: string[], exists: PathExists): ValidationResult {
  const missing = refs.filter((ref) => !exists(ref));
  if (missing.length > 0) {
    return {
      valid: false,
      reason: `Missing context references: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
}

export function createSessionRecord(request: DelegationRequest, id: string): AgentSession {
  const now = new Date().toISOString();
  return {
    id,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    needsUserInput: false,
    summary: undefined,
    artifacts: [],
    prompt: request.prompt,
    contextRefs: [...request.contextRefs],
    approvals: [...request.approvals],
    output: request.output,
    events: [
      {
        type: 'status',
        status: 'queued',
        timestamp: now,
        sessionId: id,
      },
    ],
    repository: request.repository ? { ...request.repository } : undefined,
    remoteSessionId: undefined,
    pullRequestUrl: undefined,
    pullRequestNumber: undefined,
  };
}
