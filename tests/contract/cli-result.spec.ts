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
  summary?: string;
  artifacts?: string[];
  repository?: {
    owner: string;
    repo: string;
    branch: string;
    remoteUrl: string;
  };
};

const resultResponseSchema: AnySchema = {
  type: 'object',
  required: ['id', 'status', 'summary', 'artifacts'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1 },
    status: {
      type: 'string',
      enum: ['completed', 'failed', 'cancelled'],
    },
    summary: { type: 'string' },
    artifacts: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
  },
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli result contract', () => {
  let agentHome: string;
  let workspace: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-result-'));
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

  it('returns summary and artifacts for completed sessions', async () => {
    const delegated = await runCliCommand(
      ['delegate', '--prompt', 'collect result', '--json'],
      { env: baseEnv, cwd: workspace }
    );
    expectExitCode(delegated, 0);
    const { id } = parseJson<{ id: string }>(delegated.stdout);

    const storePath = join(agentHome, 'sessions.json');
    const sessions = JSON.parse(readFileSync(storePath, 'utf8')) as SessionRecord[];
    const record = sessions.find((session) => session.id === id);
    if (record) {
      record.status = 'completed';
      record.summary = 'Implemented the requested feature.';
      record.artifacts = ['file:///workspace/result.txt'];
      record.updatedAt = new Date().toISOString();
    }
    writeFileSync(storePath, JSON.stringify(sessions, null, 2));

    const result = await runCliCommand(['result', id, '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(result, 0);
    const payload = parseJson(result.stdout);
    expectJsonSchema(payload, resultResponseSchema);
    expect(payload.summary.length).toBeGreaterThan(0);
    expect(payload.artifacts.length).toBe(1);
  });

  it('returns not found for unknown session', async () => {
    const result = await runCliCommand(['result', 'missing', '--json'], {
      env: baseEnv,
      cwd: workspace,
    });

    expectExitCode(result, 5);
    expect(result.stderr).toContain('missing');
  });
});
