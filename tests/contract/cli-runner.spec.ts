import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectExitCode, parseJson, runCliCommand } from './cli-delegate.spec';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cliScript = resolve(__dirname, '../../tools/remote-agent-cli/remote-agent-cli.js');

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

async function waitForStatus(env: NodeJS.ProcessEnv, cwd: string, id: string, expected: string, attempts = 20, delayMs = 200) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const statusResult = await runCliCommand(['status', id, '--json'], { env, cwd });
    if (statusResult.exitCode === 0) {
      const payload = parseJson<{ status: string }>(statusResult.stdout);
      if (payload.status === expected) {
        return payload;
      }
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
  }
  throw new Error(`Session ${id} did not reach status ${expected} within timeout.`);
}

describe('cli runner integration', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await chmod(cliScript, 0o755); // ensure executable bit for spawned runs
  });

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-runner-'));
    workspace = join(agentHome, 'workspace');
    mkdirSync(workspace, { recursive: true });
    baseEnv = {
      COPILOT_AGENT_HOME: agentHome,
      COPILOT_CLI_TEST_MODE: 'contract',
      COPILOT_AGENT_RUNNER_MODE: 'cli',
      COPILOT_AGENT_CLI_PATH: cliScript,
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

  it('executes external job runner and completes session', async () => {
    const delegate = await runCliCommand(
      ['delegate', '--prompt', 'Generate hello world function', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegate, 0);
    const { id } = parseJson<{ id: string }>(delegate.stdout);

    const payload = await waitForStatus(baseEnv, workspace, id, 'completed');
    expect(payload.status).toBe('completed');

    const result = await runCliCommand(['result', id, '--json'], { env: baseEnv, cwd: workspace });
    expectExitCode(result, 0);
    const resultPayload = parseJson<{ summary: string }>(result.stdout);
    expect(resultPayload.summary).toContain('Remote Agent CLI');

    const follow = await runCliCommand(['follow', id, '--json'], { env: baseEnv, cwd: workspace });
    expectExitCode(follow, 0);
    const followLines = follow.stdout.trim().split('\n').filter(Boolean);
    expect(followLines.length).toBeGreaterThan(1);
  });
});
