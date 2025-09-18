#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function parseArgs(argv) {
  const result = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      result[key] = value;
    }
  }
  return result;
}

function readContext(filePath, defaults) {
  if (!filePath) {
    return {
      prompt: defaults.prompt ?? 'No prompt supplied',
      summary: defaults.summary ?? '',
      workspace: defaults.workspace ?? process.cwd(),
      timestamp: new Date().toISOString(),
    };
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function buildEvents(context, response) {
  const now = new Date().toISOString();
  const events = [
    {
      type: 'status',
      status: 'running',
      timestamp: now,
      message: 'Job started.',
    },
    {
      type: 'log',
      timestamp: now,
      message: response.description,
    },
    {
      type: 'status',
      status: 'completed',
      timestamp: new Date(Date.now() + 200).toISOString(),
      message: 'Job completed.',
    },
  ];
  if (process.env.REMOTE_AGENT_EMIT_ERROR === '1') {
    events.splice(1, 0, {
      type: 'log',
      timestamp: now,
      message: 'Encountered recoverable issue, continuing...',
    });
  }
  return events;
}

function generateResponse(context) {
  const lines = [
    `Prompt: ${context.prompt}`,
    context.summary ? `Summary: ${context.summary}` : null,
    context.workspace ? `Workspace: ${context.workspace}` : null,
  ].filter(Boolean);

  const description = lines.join('\n');
  const response = {
    title: 'Remote Agent CLI Completed Task',
    description,
    url: context.repository?.remoteUrl ?? null,
  };
  response.events = buildEvents(context, response);
  return response;
}

function main() {
  const options = parseArgs(process.argv);
  const contextPath = options.context;

  if (!contextPath) {
    console.error('Missing required --context argument.');
    process.exit(1);
  }

  let context;
  try {
    context = readContext(contextPath, options);
  } catch (error) {
    console.error(`Failed to read context file: ${(error)?.message ?? error}`);
    process.exit(1);
  }

  const logDir = path.join(process.cwd(), '.remote-agent');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `run-${Date.now()}.jsonl`);
  fs.appendFileSync(logFile, JSON.stringify({ phase: 'received', context }) + '\n');

  const response = generateResponse(context);
  fs.appendFileSync(logFile, JSON.stringify({ phase: 'completed', response }) + '\n');

  if (process.env.REMOTE_AGENT_EMIT_ERROR === '1') {
    process.stderr.write('Simulated error path\n');
  }

  process.stdout.write(JSON.stringify(response));
}

main();
