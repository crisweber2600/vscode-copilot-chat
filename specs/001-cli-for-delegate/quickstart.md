# Quickstart: CLI Delegation

## Local (Developer)
1. Build the CLI binary (once per change)
   - `npm run build:cli`
   - Run locally via `npm run cli -- <command> [options]` or `npx --no-install copilot-cli <command> [options]`
2. Authenticate
   - Device code (interactive): `copilot-cli login --method device-code --json`
   - Environment token: `COPILOT_AGENT_TOKEN=... copilot-cli login --method env-token --json`
3. Delegate a task with context
   - `copilot-cli delegate --prompt "Add unit tests for X" --file src/foo.ts --json`
   - Quiet enqueue: `copilot-cli delegate --prompt "Docs sweep" --quiet`
4. Monitor progress
   - Stream: `copilot-cli follow <session-id> --json`
   - Poll: `copilot-cli status <session-id> --json`
5. Fetch results
   - `copilot-cli result <session-id> --json`
   - List historical sessions: `copilot-cli list --json`

## CI (Linux Worker)
1. Configure non-interactive auth
   - Provide token via environment (platform-specific)
2. Delegate without prompts
   - `copilot-cli delegate --prompt "$TASK" --folder src --non-interactive --json --quiet`
   - Capture the session id from stdout in quiet mode
3. Poll status
   - `copilot-cli status "$ID" --json`
4. Fetch results on completion
   - `copilot-cli result "$ID" --json`
5. Optional clean-up
   - Cancel stalled sessions: `copilot-cli cancel "$ID" --json`
   - Enable verbose troubleshooting: add `--verbose` to any command

## Packaging & Distribution
- Install system-wide for local users: `npm install -g .` (adds `copilot-cli` to `$PATH`).
- Produce a tarball for redistribution: `npm pack` (ships `dist/cli/...` and registered bin).
- Consume straight from the repo without installing: `npx --no-install copilot-cli <command>` after running `npm run build:cli`.
- Repository context is auto-detected from the current Git workspace (or `GITHUB_REPOSITORY`/`GITHUB_REF` in Actions) and attached to each delegation request.
- Subcommands require an authenticated session; run `copilot-cli login ...` first or they will exit with auth error code 3.

## Git Preparation
- Delegations run against the Git branch detected from the current workspace (or `GITHUB_REF` in CI). The branch must exist on the remote (defaults to `origin`). Push it manually or set `COPILOT_CLI_AUTO_COMMIT_AND_PUSH=1` to let the CLI push missing branches automatically.
- When `COPILOT_CLI_AUTO_COMMIT_AND_PUSH=1` is set and the working tree has uncommitted changes, the CLI checkpoints those changes onto a temporary branch (`copilot/cli-<timestamp>`), pushes it, and uses that branch as the coding agent's starting point. Override the checkpoint commit message with `COPILOT_CLI_AUTO_COMMIT_MESSAGE`.
- Override the remote name used for detection with `COPILOT_CLI_REMOTE_NAME` (defaults to `origin`).

### GitHub Actions Example
```yaml
jobs:
  delegate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build:cli
      - run: |
          copilot-cli login --method env-token --json
          copilot-cli delegate --prompt "Automated task" --non-interactive --approve safe-action --json --quiet
        env:
          COPILOT_AGENT_TOKEN: ${{ secrets.COPILOT_AGENT_TOKEN }}
          COPILOT_CLI_AUTO_COMMIT_AND_PUSH: '1'
          CI: '1'
```
