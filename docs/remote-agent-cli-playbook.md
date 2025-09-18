# Remote Agent CLI Playbook

This document captures the reverse-engineered flow behind
`workbench.action.chat.createRemoteAgentJob` and describes how to reproduce it
outside of VS Code.

## 1. Generate the reference extension

Run the helper script:

```bash
bash vscode/create-agent-example.sh
```

The script creates `vscode/examples/custom-agent/` with:

- a VS Code extension contributing a `remoteCodingAgents` entry
- request/response logging (`globalStorage/logs/remote-agent.log`)
- hooks to call an external CLI (defaults to `remote-agent-cli`)

## 2. Inspect real payloads

1. Open the example extension in VS Code and press F5 to launch the Extension
   Development Host.
2. Delegate a chat conversation via "Delegate to Coding Agent".
3. Review `remote-agent.log` to see the JSON payload VS Code sends and the
   response the handler returns.

These logs are the canonical data contract for the standalone CLI.

## 3. Standalone CLI (`tools/remote-agent-cli`)

The CLI accepts the same context file VS Code writes. Install it locally with:

```bash
npm install --global ./tools/remote-agent-cli
```

Usage:

```bash
remote-agent-cli --context /path/to/context.json
```

It writes JSON back to stdout, ready for the extension to consume. Logs are
stored under `.remote-agent/` in the current working directory for auditing.

## 4. Wire everything together

- In VS Code settings: set `customAgent.cliPath` to `remote-agent-cli` and ensure
  `customAgent.enabled` is `true`.
- Trigger delegation. The call chain is now:
  `VS Code → customAgent.execute → remote-agent-cli → response in chat`.
- Replicate the same flow in scripts/CI by calling `remote-agent-cli` directly.

## 5. Next steps for the repository CLI

- Replace the local JSON session stub with logic that calls `remote-agent-cli`
  (or your real backend service).
- Map CLI output to `delegate`, `status`, `follow`, `result` commands.
- Keep the contract tests by substituting a test double for the CLI.

This playbook gives you the exact protocol VS Code already uses, a reference
implementation, and a drop-in CLI so you can fully detach delegation workflows
from the editor.
