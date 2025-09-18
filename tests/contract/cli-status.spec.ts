import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnySchema } from 'ajv';
import { expectExitCode, expectJsonSchema, parseJson, runCliCommand } from './cli-delegate.spec';

type SessionRecord = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  needsUserInput: boolean;
  repository?: {
    owner: string;
    repo: string;
    branch: string;
    remoteUrl: string;
  };
};

const statusResponseSchema: AnySchema = {
  type: 'object',
  required: ['id', 'status', 'needsUserInput', 'updatedAt'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['queued', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancelled'],
    },
    needsUserInput: { type: 'boolean' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli status contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-status-'));
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

  it('reports session status with needsUserInput flag', async () => {
    const delegate = await runCliCommand(
      ['delegate', '--prompt', 'check status', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegate, 0);
    const { id } = parseJson<{ id: string }>(delegate.stdout);

    const status = await runCliCommand(['status', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });
    expectExitCode(status, 0);

    const payload = parseJson(status.stdout);
    expectJsonSchema(payload, statusResponseSchema);
    expect(payload.needsUserInput).toBe(false);
  });

  it('reflects waiting state requiring user input', async () => {
    const created = await runCliCommand(
      ['delegate', '--prompt', 'need approval', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(created, 0);
    const { id } = parseJson<{ id: string }>(created.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === id);
    expect(record).toBeDefined();
    if (record) {
      record.status = 'waiting';
      record.needsUserInput = true;
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const status = await runCliCommand(['status', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(status, 0);
    const payload = parseJson(status.stdout);
    expectJsonSchema(payload, statusResponseSchema);
    expect(payload.status).toBe('waiting');
    expect(payload.needsUserInput).toBe(true);
  });

  it('returns not-found for unknown session ids', async () => {
    const status = await runCliCommand(['status', 'missing-session', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(status, 5);
    expect(status.stderr).toContain('missing-session');
  });
});
