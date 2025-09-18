import type { AuthMethod } from '../../models/cliDelegation';
import { AuthError, ValidationError } from '../../services/errors';
import type { AuthLoginHooks, DeviceCodePromptInfo } from '../../services/authService';
import type { CliContext } from '../types';
import { getStringFlag, parseArgs, resolveOutputFormat, writeJson, writeLine } from '../utils';

const SUPPORTED_METHODS: AuthMethod[] = ['device-code', 'env-token'];

export async function loginCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const method = (getStringFlag(parsed, 'method') ?? 'device-code') as AuthMethod;

  if (!SUPPORTED_METHODS.includes(method)) {
    throw new ValidationError(`Unsupported auth method: ${method}`);
  }

  const outputFormat = resolveOutputFormat(parsed, context.ciDefaultJson);

  try {
    const hooks: AuthLoginHooks | undefined =
      method === 'device-code'
        ? {
            onDeviceCode: async (info) => {
              await handleDeviceCodePrompt(info, context);
            },
          }
        : undefined;

    const session = await context.authService.login(method, hooks);
    const payload: Record<string, unknown> = {
      status: session.status,
      method: session.method,
    };

    if (session.expiresAt) {
      payload.expiresAt = session.expiresAt;
    }

    if (outputFormat === 'json') {
      writeJson(context.stdout, payload);
    } else {
      writeLine(context.stdout, `Authenticated via ${method}.`);
    }
    return 0;
  } catch (error) {
    if (error instanceof AuthError) {
      context.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    throw error;
  }
}

async function handleDeviceCodePrompt(info: DeviceCodePromptInfo, context: CliContext): Promise<void> {
  const codeMessage = `To finish the device-code sign-in, visit ${info.verificationUri} and enter code ${info.userCode}.`;
  context.stderr.write(`${codeMessage}\n`);

  if (info.verificationUriComplete) {
    context.stderr.write(`Direct link: ${info.verificationUriComplete}\n`);
  }

  await tryOpenVerificationUrl(info, context);

  context.stderr.write('Waiting for authorization to complete...\n');
}

async function tryOpenVerificationUrl(info: DeviceCodePromptInfo, context: CliContext): Promise<void> {
  if (!shouldAttemptBrowserOpen(context)) {
    return;
  }

  const target = info.verificationUriComplete ?? info.verificationUri;

  try {
    const mod = await import('open');
    const open = mod.default ?? mod;
    await open(target, { wait: false });
  } catch (error) {
    if (context.verbose) {
      context.stderr.write(`Unable to open browser automatically: ${(error as Error).message}\n`);
    }
  }
}

function shouldAttemptBrowserOpen(context: CliContext): boolean {
  if (context.env.COPILOT_CLI_TEST_MODE) {
    return false;
  }
  if (context.env.COPILOT_CLI_NO_BROWSER) {
    return false;
  }
  if (context.env.CI) {
    return false;
  }
  const stdoutTty = typeof (context.stdout as { isTTY?: boolean }).isTTY === 'boolean' ? (context.stdout as { isTTY?: boolean }).isTTY : undefined;
  const stderrTty = typeof (context.stderr as { isTTY?: boolean }).isTTY === 'boolean' ? (context.stderr as { isTTY?: boolean }).isTTY : undefined;
  return Boolean(stdoutTty || stderrTty);
}

export default loginCommand;
