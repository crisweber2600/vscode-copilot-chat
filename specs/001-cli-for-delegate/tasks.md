# Tasks: CLI for “Delegate to coding agent”

Feature: D:/vscode-copilot-chat/specs/001-cli-for-delegate/plan.md

## Conventions
- [P] = can run in parallel
- Paths are absolute to avoid ambiguity
- Use JSON by default for CI tasks; errors to stderr

## TDD Ordering
- Tests before implementation
- Models before services before CLI commands

## Numbered Tasks

T001 — Initialize test scaffolding [P]
- Create contract test harness under `D:/vscode-copilot-chat/tests/contract/cli-delegate.spec.ts`
- Include helpers for asserting JSON schemas and exit codes
- Agent: /test create `D:/vscode-copilot-chat/tests/contract/cli-delegate.spec.ts`

T002 — Write contract tests: login/logout [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-auth.spec.ts`
- Cover device-code and env-token flows; assert JSON and exit codes (3 on auth errors)

T003 — Write contract tests: delegate [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-delegate.spec.ts`
- Validate args (prompt required), files/folders handling, quiet mode, JSON output with id/status

T004 — Write contract tests: status [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-status.spec.ts`
- Validate states, needsUserInput flag, not-found (exit 5)

T005 — Write contract tests: follow [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-follow.spec.ts`
- Validate line-delimited JSON stream and graceful interrupt

T006 — Write contract tests: list [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-list.spec.ts`
- Validate filtering by status; JSON array schema

T007 — Write contract tests: cancel [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-cancel.spec.ts`
- Validate idempotency and state transitions; exit 6 on conflict

T008 — Write contract tests: result [P]
- File: `D:/vscode-copilot-chat/tests/contract/cli-result.spec.ts`
- Validate summary and artifacts schema

T009 — Define data models [P]
- File: `D:/vscode-copilot-chat/specs/001-cli-for-delegate/data-model.md` (reference)
- Implement corresponding TypeScript interfaces under `D:/vscode-copilot-chat/src/models/cliDelegation.ts`

T010 — Implement auth service
- File: `D:/vscode-copilot-chat/src/services/authService.ts`
- Support device-code and env-token; redact logging; no prompts in non-interactive

T011 — Implement session service
- File: `D:/vscode-copilot-chat/src/services/sessionService.ts`
- CRUD for AgentSession; status, follow, list, cancel, result methods

T012 — Implement CLI command: login
- File: `D:/vscode-copilot-chat/src/cli/commands/login.ts`
- Args: --method; Output JSON; exit codes; stderr errors

T013 — Implement CLI command: logout
- File: `D:/vscode-copilot-chat/src/cli/commands/logout.ts`
- Output JSON; clear tokens/credentials

T014 — Implement CLI command: delegate
- File: `D:/vscode-copilot-chat/src/cli/commands/delegate.ts`
- Args: --prompt/arg, --file, --folder, --interactive/--non-interactive, --approve, --json/--text, --quiet
- Return { id, status, createdAt }

T015 — Implement CLI command: status
- File: `D:/vscode-copilot-chat/src/cli/commands/status.ts`
- Args: <id>, --json

T016 — Implement CLI command: follow
- File: `D:/vscode-copilot-chat/src/cli/commands/follow.ts`
- Stream LD-JSON or text; handle Ctrl-C gracefully

T017 — Implement CLI command: list
- File: `D:/vscode-copilot-chat/src/cli/commands/list.ts`
- Filters by --status; outputs sessions array JSON

T018 — Implement CLI command: cancel
- File: `D:/vscode-copilot-chat/src/cli/commands/cancel.ts`
- Idempotent; proper exit on already completed

T019 — Implement CLI command: result
- File: `D:/vscode-copilot-chat/src/cli/commands/result.ts`
- Output summary and artifacts

T020 — Wire CLI entrypoint
- File: `D:/vscode-copilot-chat/src/cli/index.ts`
- Register subcommands; set JSON default in CI; stderr for errors

T021 — Observability and security polish [P]
- Ensure no secrets printed; redact tokens; add --verbose

T022 — Documentation polish [P]
- Update `D:/vscode-copilot-chat/specs/001-cli-for-delegate/quickstart.md` with final flags and examples

T023 — Run tests and iterate
- Execute contract tests; fix defects; aim for green

## Parallelization Guidance
- T001–T008 can run in parallel as they create separate test files
- T009 can run in parallel; T010–T011 depend on models
- Commands T012–T019 depend on services and tests

## Example Task Agent Commands
- /create `D:/vscode-copilot-chat/tests/contract/cli-status.spec.ts` "// new test file contents here"
- /create `D:/vscode-copilot-chat/src/cli/commands/delegate.ts` "// command skeleton here"
