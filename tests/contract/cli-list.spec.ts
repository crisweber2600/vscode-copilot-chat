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

const listResponseSchema: AnySchema = {
  type: 'object',
  required: ['sessions'],
  additionalProperties: false,
  properties: {
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'status', 'updatedAt'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1 },
          status: {
            type: 'string',
            enum: ['queued', 'running', 'waiting', 'blocked', 'completed', 'failed', 'cancelled'],
          },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli list contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-list-'));
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

  it('lists all sessions with schema compliance', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const result = await runCliCommand(
        ['delegate', '--prompt', `session-${i}`, '--json'],
        { env: baseEnv, cwd: workspace }
      );
      expectExitCode(result, 0);
      ids.push(parseJson<{ id: string }>(result.stdout).id);
    }

    const response = await runCliCommand(['list', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(response, 0);
    const payload = parseJson(response.stdout);
    expectJsonSchema(payload, listResponseSchema);
    const sessionIds = payload.sessions.map((session: SessionRecord) => session.id);
    ids.forEach((id) => expect(sessionIds).toContain(id));
  });

  it('filters sessions by status', async () => {
    const completedResult = await runCliCommand(
      ['delegate', '--prompt', 'completed session', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(completedResult, 0);
    const completedId = parseJson<{ id: string }>(completedResult.stdout).id;

    const queuedResult = await runCliCommand(
      ['delegate', '--prompt', 'queued session', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(queuedResult, 0);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === completedId);
    if (record) {
      record.status = 'completed';
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const response = await runCliCommand(['list', '--status', 'completed', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(response, 0);
    const payload = parseJson(response.stdout);
    expectJsonSchema(payload, listResponseSchema);
    expect(payload.sessions.length).toBe(1);
    expect(payload.sessions[0].id).toBe(completedId);
  });
});
