# Research: CLI for “Delegate to coding agent”

## Unknowns and Resolutions
- Authentication flows
  - Decision: Support interactive device-code login for humans; non-interactive CI via env token or pre-configured credentials.
  - Rationale: Works across developer desktops and CI Linux workers.
- Context sources scope
  - Decision: Initial support for files/folders and current editor context; defer chat message ID/SCM history.
  - Rationale: Aligns with core UX while minimizing complexity.
- Output format and stability
  - Decision: JSON schema for all responses; human-readable optional; stable across versions; exit codes defined.
  - Rationale: CI determinism and scriptability.
- Streaming and follow semantics
  - Decision: Line-delimited JSON or concise text; resumable via `--follow` with session ID.
  - Rationale: Works in headless terminals and noisy CI logs.
- CI Linux optimization
  - Decision: Default non-interactive; JSON default; stderr for diagnostics; minimal dependencies.
  - Rationale: Reliable automation behavior.

## Alternatives Considered
- Prompt-only with no session tracking → Rejected: lacks durability and monitoring.
- Text-only output → Rejected: poor CI integration.
- Interactive-only approval model → Rejected: incompatible with CI.

## Best Practices Snapshot
- Principle: Text I/O, JSON for machines, errors to stderr, clear exit codes.
- Security: Never print secrets; redact tokens; follow org policies.
- Observability: Verbose logs opt-in; timestamps on events; monotonic sequence IDs.
