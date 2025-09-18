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

const cancelResponseSchema: AnySchema = {
  type: 'object',
  required: ['id', 'status'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['cancelled'],
    },
  },
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli cancel contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-cancel-'));
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

  it('cancels a running session and returns updated state', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'need cancel', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === id);
    if (record) {
      record.status = 'running';
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const cancel = await runCliCommand(['cancel', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(cancel, 0);
    const payload = parseJson(cancel.stdout);
    expectJsonSchema(payload, cancelResponseSchema);
  });

  it('is idempotent for already cancelled sessions', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'cancel twice', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const cancel = await runCliCommand(['cancel', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });
    expectExitCode(cancel, 0);

    const second = await runCliCommand(['cancel', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });
    expectExitCode(second, 0);
    const payload = parseJson(second.stdout);
    expect(payload.status).toBe('cancelled');
  });

  it('exits with conflict when session already completed', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'already done', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === id);
    if (record) {
      record.status = 'completed';
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const cancel = await runCliCommand(['cancel', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(cancel, 6);
    expect(cancel.stderr).toContain('completed');
  });
});
