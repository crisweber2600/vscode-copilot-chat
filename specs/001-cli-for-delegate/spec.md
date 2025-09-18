# Feature Specification: CLI for “Delegate to coding agent”

**Feature Branch**: `001-cli-for-delegate`
**Status**: Draft
**Input**: Create a command-line interface (CLI) that performs the same workflow as the UI’s “Delegate to coding agent” action, allowing users and automations to hand off tasks to a coding agent with context and track progress.

## Execution Flow (main)
```
1. Parse user description from Input
   → If empty: ERROR "No feature description provided"
2. Extract key concepts from description
   → Identify: actors (developer, CI/CD, CLI user), actions (delegate, pass context, monitor), data (prompt text, file refs, mode), constraints (non-interactive, auth)
3. For each unclear aspect:
   → Mark with [NEEDS CLARIFICATION: specific question]
4. Fill User Scenarios & Testing section
   → If no clear user flow: ERROR "Cannot determine user scenarios"
5. Generate Functional Requirements
   → Each requirement must be testable
   → Mark ambiguous requirements
6. Identify Key Entities (if data involved)
7. Run Review Checklist
   → If any [NEEDS CLARIFICATION]: WARN "Spec has uncertainties"
   → If implementation details found: ERROR "Remove tech details"
8. Return: SUCCESS (spec ready for planning)
```

---

## Quick Guidelines
- Focus on WHAT users need and WHY
- Avoid HOW to implement (no tech stack, APIs, code structure)
- Written for business stakeholders, not developers

### Section Requirements
- Mandatory sections: Must be completed for every feature
- Optional sections: Include only when relevant to the feature
- When a section doesn't apply, remove it entirely (don't leave as "N/A")

### For AI Generation
When creating this spec from a user prompt:
1. Mark all ambiguities: Use [NEEDS CLARIFICATION: specific question] for any assumption you'd need to make
2. Don't guess: If the prompt doesn't specify something, mark it
3. Think like a tester: Every vague requirement should fail the "testable and unambiguous" checklist item
4. Common underspecified areas:
   - User types and permissions
   - Data retention/deletion policies
   - Performance targets and scale
   - Error handling behaviors
   - Integration requirements
   - Security/compliance needs

---

## User Scenarios & Testing (mandatory)

### Primary User Story
As a developer or automation user, I want to delegate a coding task from the command line—supplying a natural language prompt and optional file/folder references—so that a coding agent can execute the task in the background while I monitor progress and receive results without using the UI.

### Acceptance Scenarios
1. Given an open workspace and an authenticated environment, When I run the CLI to delegate a task with a prompt and file references, Then a new coding agent session is created, relevant context is attached, and I see a session ID or link to track progress.
2. Given an existing delegated session, When I run the CLI to check status using its ID, Then I receive a concise status summary including phase, last update time, and any pending approvals or actions.
3. Given a long-running agent task, When I run the CLI with a “follow/stream” option, Then I see live progress updates and can exit at any time without cancelling the task.
4. Given a session that completed, When I fetch the results via CLI, Then I can review a summary of changes, key outputs, and links to detailed logs.
5. Given a session waiting on approval for a risky action, When I run the CLI in interactive mode, Then I’m prompted to approve/deny the action and the agent proceeds accordingly.
6. Given a non-interactive environment (CI), When I run the CLI with explicit non-interactive flags and pre-approvals, Then the task runs without interactive prompts and fails clearly if additional input would be required.

### Edge Cases
- Empty or excessively long prompt → validation error with guidance.
- Missing authentication or insufficient permissions → clear error and hint to authenticate or enable features.
- Invalid or non-existent file/folder references → fail fast and list which references were invalid.
- Concurrent sessions limit reached → error with suggestion to retry or close existing sessions.
- Organization policy disables coding agents → explain restriction and point to enablement path.
- Network offline or provider unavailable → actionable error and retry guidance.
- Detached terminal during streaming → underlying session continues; CLI exits with message on how to resume.

## Requirements (mandatory)

### Functional Requirements
- FR-001: The system MUST provide a CLI command to delegate a task to a coding agent using a natural language prompt.
- FR-002: The system MUST allow attaching context to the delegation request, including specific files, folders, history items, problems, or other supported references.
- FR-003: The system MUST create a new agent session for each delegation request and return a durable session identifier.
- FR-004: The system MUST provide a way to view status for a given session, including current phase/progress, last event time, and whether user input is required.
- FR-005: The system MUST support an option to stream progress/output live to the console without requiring the UI.
- FR-006: The system MUST allow interactive approvals for risky actions when running in interactive mode.
- FR-007: The system MUST support non-interactive mode, failing fast if input would be required unless pre-approvals are provided via flags or config.
- FR-008: The system MUST surface a concise results summary for completed sessions, including a changes overview and links/paths to detailed logs or artifacts, when applicable.
- FR-009: The system MUST forward additional context from the request (such as file references) to the coding agent, consistent with the UI’s “Delegate to coding agent” behavior.
- FR-010: The system MUST allow cancellation of an active session via the CLI.
- FR-011: The system MUST emit clear, actionable error messages for common failures (auth, policy disabled, invalid references, connectivity).
- FR-012: The system MUST provide help/usage text and discoverable subcommands/flags.
- FR-013: The system MUST respect organization and workspace policies regarding coding agents and require opt-in where applicable.
- FR-014: The system MUST operate cross-platform and work in local VS Code environments where coding agent features are available.
- FR-015: The CLI MUST support returning machine-readable output (e.g., JSON) for scripting and CI use.
- FR-016: The system MUST handle multiple concurrent delegated sessions and provide list/filter commands to discover them.
- FR-017: The system MUST support referencing an existing chat or context to seed the delegation request, when provided by the user. [NEEDS CLARIFICATION: What sources beyond files/folders should be supported initially—recent chat message ID, current editor, SCM history item?]
- FR-018: The system MUST align with the UX semantics of “Delegate to coding agent” in chat, where additional context is forwarded and a new session is opened showing real-time progress. (Grounded by release notes.)
- FR-019: The system MUST provide a quiet mode that exits successfully after enqueuing the task, printing only the session ID.
- FR-020: The system MUST provide a retry mechanism or guidance for transient failures (e.g., network).

### Non-Functional Requirements
- NFR-001: Usability — Commands and flags MUST be self-explanatory with examples accessible via help.
- NFR-002: Reliability — Delegation MUST succeed under intermittent connectivity with clear retry guidance.
- NFR-003: Performance — Creating a delegation MUST complete promptly; status calls SHOULD return within a short, predictable time.
- NFR-004: Security & Compliance — The CLI MUST not bypass existing approvals, policies, or consent mechanisms.
- NFR-005: Observability — The CLI SHOULD provide verbose logging for troubleshooting, redacting sensitive data.
- NFR-006: Accessibility — Output SHOULD be readable in common terminals; support high-contrast and screen reader-friendly text.

### Key Entities
- Delegation Request: user prompt, optional context references, mode (interactive/non-interactive), output format (text/JSON), pre-approvals.
- Agent Session: unique session ID, status (queued/running/waiting/blocked/completed/failed/cancelled), timestamps, progress events, outputs/links.
- Approval Event: request type (tool/command/action), description, decision (approve/deny), actor, timestamp.

---

## Review & Acceptance Checklist

### Content Quality
- [ ] No implementation details (languages, frameworks, APIs)
- [ ] Focused on user value and business needs
- [ ] Written for non-technical stakeholders
- [ ] All mandatory sections completed

### Requirement Completeness
- [ ] No [NEEDS CLARIFICATION] markers remain
- [ ] Requirements are testable and unambiguous
- [ ] Success criteria are measurable
- [ ] Scope is clearly bounded
- [ ] Dependencies and assumptions identified

---

## Execution Status

- [x] User description parsed
- [x] Key concepts extracted
- [x] Ambiguities marked
- [x] User scenarios defined
- [x] Requirements generated
- [x] Entities identified
- [ ] Review checklist passed

---
