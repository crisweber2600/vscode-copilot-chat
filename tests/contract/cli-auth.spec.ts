import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnySchema } from 'ajv';
import { expectExitCode, expectJsonSchema, parseJson, runCliCommand } from './cli-delegate.spec';

const loginResponseSchema: AnySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['authenticated'] },
    expiresAt: { type: 'string', format: 'date-time' },
    method: { type: 'string' },
  },
  required: ['status', 'method'],
  additionalProperties: false,
};

const logoutResponseSchema: AnySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['unauthenticated'] },
  },
  required: ['status'],
  additionalProperties: false,
};

vi.setConfig({ testTimeout: 40000, hookTimeout: 40000 });

describe('cli auth contract', () => {
  let agentHome: string;
  let baseEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    agentHome = mkdtempSync(join(tmpdir(), 'cli-auth-'));
    baseEnv = {
      COPILOT_AGENT_HOME: agentHome,
      COPILOT_CLI_TEST_MODE: 'contract',
    };
  });

  afterEach(() => {
    rmSync(agentHome, { recursive: true, force: true });
  });

  it('authenticates via device-code flow and persists session', async () => {
    const result = await runCliCommand(['login', '--method', 'device-code', '--json'], {
      env: baseEnv,
    });

    expectExitCode(result, 0);
    const payload = parseJson(result.stdout);
    expectJsonSchema(payload, loginResponseSchema);
    expect(payload.method).toBe('device-code');
    expect(result.stderr).toContain('device');
  });

  it('authenticates via env-token when token provided', async () => {
    const result = await runCliCommand(['login', '--method', 'env-token', '--json'], {
      env: {
        ...baseEnv,
        COPILOT_AGENT_TOKEN: 'test-token',
      },
    });

    expectExitCode(result, 0);
    const payload = parseJson(result.stdout);
    expectJsonSchema(payload, loginResponseSchema);
    expect(payload.method).toBe('env-token');
  });

  it('fails env-token login without token', async () => {
    const result = await runCliCommand(['login', '--method', 'env-token', '--json'], {
      env: baseEnv,
    });

    expectExitCode(result, 3);
    expect(result.stderr).toContain('token');
  });

  it('logs out and clears session state', async () => {
    const env = {
      ...baseEnv,
      COPILOT_AGENT_TOKEN: 'logout-token',
    };

    const login = await runCliCommand(['login', '--method', 'env-token', '--json'], { env });
    expectExitCode(login, 0);

    const logout = await runCliCommand(['logout', '--json'], { env });
    expectExitCode(logout, 0);
    const payload = parseJson(logout.stdout);
    expectJsonSchema(payload, logoutResponseSchema);
  });
});
