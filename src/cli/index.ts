#!/usr/bin/env node
import { homedir } from 'node:os';
import { join } from 'node:path';
import loginCommand from './commands/login';
import logoutCommand from './commands/logout';
import delegateCommand from './commands/delegate';
import statusCommand from './commands/status';
import followCommand from './commands/follow';
import listCommand from './commands/list';
import cancelCommand from './commands/cancel';
import resultCommand from './commands/result';
import type { CliContext, CommandHandler } from './types';
import { AuthService } from '../services/authService';
import { SessionService } from '../services/sessionService';
import { isServiceError, ServiceError, UnexpectedError } from '../services/errors';

const COMMANDS: Record<string, CommandHandler> = {
  login: loginCommand,
  logout: logoutCommand,
  delegate: delegateCommand,
  status: statusCommand,
  follow: followCommand,
  list: listCommand,
  cancel: cancelCommand,
  result: resultCommand,
};

function envTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(normalized);
}

function createContext(verbose: boolean): CliContext {
  const env = process.env;
  const agentHome = env.COPILOT_AGENT_HOME ?? join(homedir(), '.copilot-agent');
  const authService = new AuthService({ agentHome, env });
  const sessionService = new SessionService({
    agentHome,
    runnerMode: env.COPILOT_CLI_TEST_MODE ? 'stub' : 'cli',
    authService,
  });
  return {
    authService,
    sessionService,
    stdout: process.stdout,
    stderr: process.stderr,
    env,
    cwd: process.cwd(),
    agentHome,
    ciDefaultJson: envTruthy(env.CI) || envTruthy(env.COPILOT_CLI_JSON_DEFAULT),
    verbose,
  };
}

function extractCommandArgs(rawArgs: string[]): { commandName: string | undefined; args: string[]; verbose: boolean } {
  const args: string[] = [];
  let verbose = false;
  let commandName: string | undefined;

  for (const arg of rawArgs) {
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }

    if (!commandName) {
      commandName = arg;
    } else {
      args.push(arg);
    }
  }

  return { commandName, args, verbose };
}

function printHelp(): void {
  const lines = [
    'Usage: copilot-cli <command> [options]',
    '',
    'Commands:',
    '  login     Authenticate with the coding agent service',
    '  logout    Clear authentication state',
    '  delegate  Create a new delegated session',
    '  status    Show the latest status for a session',
    '  follow    Stream live updates for a session',
    '  list      List sessions (optionally filtered by status)',
    '  cancel    Cancel an active session',
    '  result    Fetch the final result for a session',
    '',
    'Global options:',
    '  --verbose   Enable verbose error output',
  ];
  lines.forEach((line) => process.stdout.write(`${line}\n`));
}

async function run(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) {
    printHelp();
    process.exitCode = 0;
    return;
  }

  const { commandName, args, verbose } = extractCommandArgs(rawArgs);

  if (!commandName || commandName === 'help') {
    printHelp();
    process.exitCode = commandName ? 0 : 2;
    return;
  }

  const command = COMMANDS[commandName];
  if (!command) {
    process.stderr.write(`Unknown command: ${commandName}\n`);
    process.exitCode = 2;
    return;
  }

  const context = createContext(verbose);

  try {
    const exitCode = await command(args, context);
    process.exitCode = exitCode;
  } catch (error) {
    handleError(error, context);
  }
}

function handleError(error: unknown, context: CliContext): void {
  if (isServiceError(error)) {
    context.stderr.write(`${(error as ServiceError).message}\n`);
    process.exitCode = (error as ServiceError).exitCode;
    return;
  }

  const unexpected = error instanceof Error ? error : new UnexpectedError('Unexpected failure.');
  context.stderr.write(`Unexpected error: ${unexpected.message}\n`);
  if (context.verbose && unexpected instanceof Error && unexpected.stack) {
    context.stderr.write(`${unexpected.stack}\n`);
  }
  process.exitCode = unexpected instanceof ServiceError ? unexpected.exitCode : 9;
}

run().catch((error) => {
  handleError(error, createContext(envTruthy(process.env.COPILOT_CLI_VERBOSE)));
});
