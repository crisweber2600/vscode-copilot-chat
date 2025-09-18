import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { expectExitCode, parseJson, runCliCommand, spawnCliProcess } from './cli-delegate.spec';

type SessionRecord = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  needsUserInput: boolean;
  events?: Array<{
    type: string;
    status?: string;
    message?: string;
    timestamp: string;
  }>;
  repository?: {
    owner: string;
    repo: string;
    branch: string;
    remoteUrl: string;
  };
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli follow contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-follow-'));
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

  it('streams line-delimited json events until completion', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'stream events', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === id);
    expect(record).toBeDefined();
    if (record) {
      record.events = [
        {
          type: 'status',
          status: 'queued',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'log',
          message: 'Agent is analyzing the request',
          timestamp: new Date().toISOString(),
        },
        {
          type: 'status',
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
      ];
      record.status = 'completed';
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const follow = await runCliCommand(['follow', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(follow, 0);
    const lines = follow.stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(1);
    const last = parseJson(lines[lines.length - 1]);
    expect(last.status).toBe('completed');
  });

  it('gracefully exits on interrupt while streaming', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'long stream', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const child = spawnCliProcess(['follow', id, '--json'], {
      env: {
        ...baseEnv,
        COPILOT_CLI_TEST_FOLLOW_DELAY_MS: '2000',
      },
      cwd: workspace,
    });

    const chunks: string[] = [];
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      chunks.push(chunk);
    });

    await once(child.stdout!, 'data');
    child.kill('SIGINT');

    const [code] = (await once(child, 'exit')) as [number | null, NodeJS.Signals | null];
    expect(code === null ? 0 : code).toBe(0);

    const combined = chunks.join('');
    const firstLine = combined.trim().split('\n')[0];
    expect(() => parseJson(firstLine)).not.toThrow();
  });
});
