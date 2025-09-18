import { setTimeout as delay } from 'node:timers/promises';
import { ValidationError } from '../../services/errors';
import type { CliContext } from '../types';
import { parseArgs, resolveOutputFormat, writeLine } from '../utils';

export async function followCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const id = parsed.positionals[0];

  if (!id) {
    throw new ValidationError('Session id is required.');
  }

  await context.authService.requireSession();

  const format = resolveOutputFormat(parsed, context.ciDefaultJson);
  const events = await context.sessionService.getFollowEvents(id);
  const delayMs = Number.parseInt(context.env.COPILOT_CLI_TEST_FOLLOW_DELAY_MS ?? '0', 10);

  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
  };

  process.once('SIGINT', onSigint);

  try {
    for (const event of events) {
      if (interrupted) {
        break;
      }

      if (format === 'json') {
        context.stdout.write(`${JSON.stringify(event)}\n`);
      } else {
        writeLine(context.stdout, `${event.timestamp}: ${event.type}`);
      }

      if (!interrupted && delayMs > 0) {
        await delay(delayMs);
      }
    }

    if (interrupted) {
      context.stderr.write('Streaming interrupted by user.\n');
    }

    return 0;
  } finally {
    process.removeListener('SIGINT', onSigint);
  }
}

export default followCommand;
