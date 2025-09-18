# Remote Agent CLI

This standalone command-line tool mirrors the payload contract used by VS Code's
`workbench.action.chat.createRemoteAgentJob` command. It can be invoked directly
by the custom agent extension created through `vscode/create-agent-example.sh`
or used on its own to process delegation requests outside of VS Code.

## Usage

```bash
remote-agent-cli --context /path/to/context.json
```

The context file matches the JSON structure logged by the extension template:

```json
{
  "prompt": "user prompt",
  "summary": "conversation summary",
  "workspace": "/path/to/workspace",
  "timestamp": "2025-01-01T00:00:00.000Z"
}
```

When invoked with `--context`, the tool writes a JSON response to stdout:

```json
{
  "title": "Remote Agent CLI Completed Task",
  "description": "Prompt: ...\nSummary: ...",
  "url": null
}
```

Responses are intentionally minimal—wire your own automation, API calls, or
result upload logic into `generateResponse`.

## Local testing

```bash
node tools/remote-agent-cli/remote-agent-cli.js \
  --context tools/remote-agent-cli/sample-context.json
```

The CLI writes diagnostic logs to `.remote-agent/run-<timestamp>.jsonl` inside
the working directory so you can inspect end-to-end payloads.

Install as a binary by running:

```bash
npm install --global ./tools/remote-agent-cli
```

After that, update the custom agent extension's `customAgent.cliPath` setting
(or configuration default) to point to `remote-agent-cli`.
