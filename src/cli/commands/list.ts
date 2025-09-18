import type { AgentSessionStatus } from '../../models/cliDelegation';
import { ValidationError } from '../../services/errors';
import type { CliContext } from '../types';
import { getStringFlag, parseArgs, resolveOutputFormat, writeJson, writeLine } from '../utils';

const STATUSES: AgentSessionStatus[] = [
  'queued',
  'running',
  'waiting',
  'blocked',
  'completed',
  'failed',
  'cancelled',
];

export async function listCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const statusFilter = getStringFlag(parsed, 'status');
  const format = resolveOutputFormat(parsed, context.ciDefaultJson);

  if (statusFilter && !STATUSES.includes(statusFilter as AgentSessionStatus)) {
    throw new ValidationError(`Unsupported status filter: ${statusFilter}`);
  }

  await context.authService.requireSession();

  const sessions = await context.sessionService.list(
    statusFilter ? { status: statusFilter as AgentSessionStatus } : undefined
  );

  const payload = {
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      updatedAt: session.updatedAt,
    })),
  };

  if (format === 'json') {
    writeJson(context.stdout, payload);
  } else {
    if (payload.sessions.length === 0) {
      writeLine(context.stdout, 'No sessions found.');
    } else {
      payload.sessions.forEach((session) => {
        writeLine(context.stdout, `${session.id}\t${session.status}\t${session.updatedAt}`);
      });
    }
  }

  return 0;
}

export default listCommand;
