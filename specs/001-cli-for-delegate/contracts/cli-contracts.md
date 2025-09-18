# CLI Contracts: Delegate to Coding Agent

## Subcommands
- delegate
- status
- follow
- list
- cancel
- result
- login
- logout

## Common
- --json: outputs machine-readable JSON
- --quiet: minimal output (on success prints ID)
- Exit codes: 0 success; 2 validation; 3 auth; 4 policy; 5 not found; 6 conflict; 7 cancelled; 8 provider; 9 unexpected

## delegate
Input
- prompt: string (arg or --prompt)
- --file <path> (repeatable)
- --folder <path> (repeatable)
- --interactive | --non-interactive
- --approve <action> (repeatable)
- --json | --text

Output (JSON)
- { id, status, createdAt }

## status
Input
- <id>
- --json

Output (JSON)
- { id, status, needsUserInput, updatedAt }

## follow
Input
- <id>
- --json | --text

Output (stream)
- line-delimited JSON or text events

## list
Input
- --status <filter>
- --json

Output (JSON)
- { sessions: [ { id, status, updatedAt } ] }

## cancel
Input
- <id>
- --json

Output (JSON)
- { id, status }

## result
Input
- <id>
- --json | --text

Output (JSON)
- { id, status, summary, artifacts }

## login
Input
- --method device-code | env-token
- --json

Output (JSON)
- { status, expiresAt? }

## logout
Input
- none

Output (JSON)
- { status }
