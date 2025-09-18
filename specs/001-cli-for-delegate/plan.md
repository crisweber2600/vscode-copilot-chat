# Implementation Plan: CLI for “Delegate to coding agent”

**Branch**: `001-cli-for-delegate` | **Date**: 2025-09-16 | **Spec**: D:/vscode-copilot-chat/specs/001-cli-for-delegate/spec.md
**Input**: Feature specification from `D:/vscode-copilot-chat/specs/001-cli-for-delegate/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → If not found: ERROR "No feature spec at {path}"
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → Detect Project Type from context (CLI for VS Code Copilot Chat)
   → Set Structure Decision based on project type (Single project)
3. Fill the Constitution Check section based on the content of the constitution document.
4. Evaluate Constitution Check section below
   → If violations exist: Document in Complexity Tracking
   → If no justification possible: ERROR "Simplify approach first"
   → Update Progress Tracking: Initial Constitution Check
5. Execute Phase 0 → research.md
   → Resolve NEEDS CLARIFICATION from spec for initial scope
6. Execute Phase 1 → contracts, data-model.md, quickstart.md
7. Re-evaluate Constitution Check section
   → If new violations: Refactor design, return to Phase 1
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach; and per prompt, generate tasks.md
9. STOP - Ready for /tasks command
```

## Summary
A command-line interface (CLI) that mirrors the UI’s “Delegate to coding agent” action. Users and CI systems can delegate a task with a natural language prompt and optional file/folder context, receive a durable session ID, stream status and logs, approve actions (interactive mode), operate non-interactively for CI (with pre-approvals), cancel sessions, and retrieve results. Output supports human-readable and machine-readable (JSON) formats. Includes login capabilities for interactive and CI environments. Optimized for CI Linux workers (headless, non-interactive, deterministic JSON, explicit exit codes).

## Technical Context
**Language/Version**: NEEDS CLARIFICATION (CLI host within VS Code ecosystem)  
**Primary Dependencies**: NEEDS CLARIFICATION  
**Storage**: N/A  
**Testing**: NEEDS CLARIFICATION (contract and integration tests mandated)  
**Target Platform**: Linux CI workers (primary), macOS/Windows local dev (secondary)  
**Project Type**: single (CLI utility within extension context)  
**Performance Goals**: Startup under ~2 seconds; status checks return within ~1 second (network permitting)  
**Constraints**: Headless by default; non-interactive mode must not prompt; JSON output stable; secrets never printed  
**Scale/Scope**: Multiple concurrent agent sessions; list and filter supported

Additional user-provided constraints (arguments):
- CLI must include login capabilities (interactive device-code and non-interactive via token/env)
- Optimized for CI Linux workers (no prompts, JSON by default, clear exit codes, stderr logging)

## Constitution Check
Gate decisions derived from the constitution’s core principles:
- Library-First: Expose functionality via a library boundary, CLI as a thin wrapper → PASS (doc-only at plan stage)
- CLI Interface: Text I/O, support JSON + human-readable, stderr for errors → PASS (captured in contracts)
- Test-First (Non-negotiable): Contract tests precede implementation; red-green-refactor → PASS (Phase 1 outputs include failing tests)
- Observability: Structured logs, redact secrets, deterministic JSON → PASS (contracts/quickstart capture logging/JSON)
- Simplicity: Single-project structure, avoid unnecessary dependencies → PASS (structure decision recorded)

## Project Structure

### Documentation (this feature)
```
specs/001-cli-for-delegate/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
└── tasks.md             # Phase 2 output (/plan command per prompt)
```

### Source Code (repository root)
```
# Option 1: Single project (DEFAULT)
src/
  ├── models/
  ├── services/
  ├── cli/
  └── lib/

tests/
  ├── contract/
  ├── integration/
  └── unit/
```

**Structure Decision**: DEFAULT Option 1 (single project)

## Phase 0: Outline & Research
Unknowns and decisions captured in `research.md`:
- Authentication for CLI (interactive vs CI) → Decision: support device-code interactive login; CI uses environment token or non-interactive login.
- Initial context sources → Decision: support files/folders and current editor; defer chat message ID/SCM history to future.
- Output conventions → Decision: JSON schema defined; human-readable optional; exit codes standardised.
- Streaming format → Decision: line-delimited JSON events and/or concise text; resumable follow.
- CI optimizations → Decision: non-interactive default in CI; logs to stderr; JSON default; deterministic schemas.

**Output**: `research.md` generated

## Phase 1: Design & Contracts
- Entities extracted to `data-model.md` (DelegationRequest, AgentSession, ApprovalEvent, AuthSession; validation + states)
- CLI contracts created in `/contracts/` with request/response schemas and exit codes
- Quickstart for local and CI Linux in `quickstart.md`

**Output**: `data-model.md`, `contracts/*`, `quickstart.md` generated

## Phase 2: Task Planning Approach
Task generation strategy (and created `tasks.md` per prompt):
- Contracts → contract test tasks (prioritised)
- Entities → model creation tasks
- CLI subcommands → implementation tasks (delegate, status, follow, list, cancel, result, login, logout)
- Non-interactive & JSON → default behaviors and flags
- Observability & security → structured logging, redaction
- CI Linux optimisations → headless, explicit exit codes, stable JSON

**Estimated Output**: ~25 ordered tasks captured in `tasks.md`

## Phase 3+: Future Implementation
Beyond /plan scope; driven by tasks.md

## Complexity Tracking
No deviations at this stage.

## Progress Tracking
**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - tasks.md created)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (for initial scope)
- [ ] Complexity deviations documented (none)

---
*Based on Constitution v2.1.1 - See `D:/vscode-copilot-chat/.specify/memory/constitution.md`*
