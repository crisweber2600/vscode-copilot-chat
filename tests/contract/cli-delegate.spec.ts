import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import Ajv, { type AnySchema } from 'ajv';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

export interface CliResult {
  readonly args: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
}

export interface CliRunOptions {
  env?: NodeJS.ProcessEnv;
  input?: string;
  timeoutMs?: number;
  cwd?: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_ENTRY = resolve(__dirname, '../../src/cli/index.ts');
const TSX_ENTRY = resolve(__dirname, '../../node_modules/tsx/dist/cli.cjs');
const ajv = new Ajv({ allErrors: true, strict: false });

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

function collectStream(child: ChildProcess): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    if (!child.stdout || !child.stderr) {
      reject(new Error('CLI spawn did not provide stdout/stderr streams'));
      return;
    }

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.once('error', reject);
    child.once('close', () => resolve({ stdout, stderr }));
  });
}

export function spawnCliProcess(args: readonly string[], options: CliRunOptions = {}): ChildProcess {
  const { env, cwd } = options;
  return spawn(process.execPath, [TSX_ENTRY, CLI_ENTRY, ...args], {
    cwd: cwd ?? resolve(__dirname, '../../'),
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

export async function runCliCommand(
  args: readonly string[],
  options: CliRunOptions = {}
): Promise<CliResult> {
  const { input, timeoutMs = 30000 } = options;
  const child = spawnCliProcess(args, options);

  if (input) {
    child.stdin?.write(input);
    child.stdin?.end();
  }

  const timeout = timeoutMs > 0 ? setTimeout(() => {
    child.kill('SIGKILL');
  }, timeoutMs) : null;

  const [streams, exitTuple] = await Promise.all([
    collectStream(child),
    once(child, 'exit') as Promise<[number | null, NodeJS.Signals | null]>,
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  const [code, signal] = exitTuple;
  const exit = typeof code === 'number' ? code : child.exitCode;
  return {
    args,
    stdout: streams.stdout,
    stderr: streams.stderr,
    exitCode: typeof exit === 'number' ? exit : 1,
    signal: signal ?? child.signalCode,
  };
}

export function expectExitCode(result: CliResult, expected: number) {
  expect(result.exitCode, `Expected exit code ${expected}, received ${result.exitCode}. stderr: ${result.stderr}`).toBe(expected);
}

export function expectJsonSchema<T>(payload: unknown, schema: AnySchema): asserts payload is T {
  const validate = ajv.compile(schema);
  const valid = validate(payload);
  if (!valid) {
    const message = ajv.errorsText(validate.errors, { separator: '\n' });
    throw new Error(`JSON schema assertion failed:\n${message}`);
  }
}

export function parseJson<T = unknown>(stdout: string): T {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Expected stdout to contain JSON payload, received empty output');
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON from stdout: ${(error as Error).message}\nOutput: ${trimmed}`);
  }
}

const delegateResponseSchema: AnySchema = {
  type: 'object',
  required: ['id', 'status', 'createdAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancelled'],
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

describe('cli delegate contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-delegate-'));
    workspace = join(agentHome, 'workspace');
    mkdirSync(workspace, { recursive: true });
    baseEnv = {
      COPILOT_AGENT_HOME: agentHome,
      COPILOT_CLI_TEST_MODE: 'contract',
    };

    const login = await runCliCommand(['login', '--method', 'device-code', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });
    expectExitCode(login, 0);
  });

  afterEach(() => {
    rmSync(agentHome, { recursive: true, force: true });
  });

  it('requires a prompt', async () => {
    const result = await runCliCommand(['delegate', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(result, 2);
    expect(result.stderr).toContain('prompt');
  });

  it('enqueues a delegation request with JSON output', async () => {
    const prompt = 'Refactor the authentication module';
    const filePath = join(workspace, 'auth.ts');
    writeFileSync(filePath, 'export const stub = true;');

    const result = await runCliCommand(
      ['delegate', '--prompt', prompt, '--file', filePath, '--json'],
      {
        env: baseEnv,
        cwd: workspace,
      }
    );

    expectExitCode(result, 0);
    const payload = parseJson(result.stdout);
    expectJsonSchema(payload, delegateResponseSchema);
    expect(payload.status).toBe('queued');
  });

  it('fails when referenced files do not exist', async () => {
    const result = await runCliCommand(
      ['delegate', '--prompt', 'do something', '--file', 'missing.txt', '--json'],
      {
        env: baseEnv,
        cwd: workspace,
      }
    );

    expectExitCode(result, 2);
    expect(result.stderr).toContain('missing.txt');
  });

  it('supports quiet mode outputting only the session id', async () => {
    const prompt = 'Implement feature flag toggle';
    const result = await runCliCommand(
      ['delegate', '--prompt', prompt, '--quiet'],
      {
        env: baseEnv,
        cwd: workspace,
      }
    );

    expectExitCode(result, 0);
    const trimmed = result.stdout.trim();
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.split('\n').length).toBe(1);
  });

  it('validates folder references', async () => {
    const contextFolder = join(workspace, 'context');
    mkdirSync(contextFolder);
    writeFileSync(join(contextFolder, 'README.md'), '# context');

    const result = await runCliCommand(
      ['delegate', '--prompt', 'analyze context', '--folder', contextFolder, '--json'],
      {
        env: baseEnv,
        cwd: workspace,
      }
    );

    expectExitCode(result, 0);
    const payload = parseJson(result.stdout);
    expectJsonSchema(payload, delegateResponseSchema);
  });

  it('captures repository metadata from GitHub Actions environment variables', async () => {
    const env = {
      ...baseEnv,
      GITHUB_REPOSITORY: 'octocat/hello-world',
      GITHUB_REF: 'refs/heads/feature-branch',
    };

    const result = await runCliCommand(
      ['delegate', '--prompt', 'repo context capture', '--json'],
      {
        env,
        cwd: workspace,
      }
    );

    expectExitCode(result, 0);
    const payload = parseJson<{ id: string }>(result.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as Array<{ id: string; repository?: Record<string, unknown> }>;
    const record = sessions.find((session) => session.id === payload.id);

    expect(record?.repository).toBeDefined();
    expect(record?.repository).toMatchObject({
      provider: 'github',
      owner: 'octocat',
      repo: 'hello-world',
      branch: 'feature-branch',
    });
  });
});
