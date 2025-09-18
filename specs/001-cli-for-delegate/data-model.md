# Data Model: CLI Delegation

## Entities

### DelegationRequest
- prompt: string (1..2048)
- contextRefs: array<URI or path>
- interactive: boolean
- approvals: array<string> (pre-approved actions)
- output: enum { json, text }

### AgentSession
- id: string (durable)
- status: enum { queued, running, waiting, blocked, completed, failed, cancelled }
- createdAt: datetime
- updatedAt: datetime
- needsUserInput: boolean
- summary: string
- artifacts: array<URI>

### ApprovalEvent
- sessionId: string
- requestType: string
- description: string
- decision: enum { approve, deny, pending }
- actor: string
- timestamp: datetime

### AuthSession
- method: enum { device-code, env-token }
- status: enum { unauthenticated, authenticated, expired }
- expiresAt: datetime?

## Validation Rules
- prompt must be present and within length bounds
- all contextRefs must exist and be accessible
- non-interactive mode must not trigger prompts

## State Transitions
- queued → running → { waiting ↔ running } → { completed | failed | cancelled }
