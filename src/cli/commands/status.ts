import { ValidationError } from '../../services/errors';
import type { CliContext } from '../types';
import { parseArgs, resolveOutputFormat, writeJson, writeLine } from '../utils';

export async function statusCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const id = parsed.positionals[0];

  if (!id) {
    throw new ValidationError('Session id is required.');
  }

  await context.authService.requireSession();

  const format = resolveOutputFormat(parsed, context.ciDefaultJson);
  const session = await context.sessionService.get(id);

  const payload = {
    id: session.id,
    status: session.status,
    needsUserInput: session.needsUserInput,
    updatedAt: session.updatedAt,
  };

  if (format === 'json') {
    writeJson(context.stdout, payload);
  } else {
    writeLine(
      context.stdout,
      `Session ${session.id} is ${session.status} (needs input: ${session.needsUserInput}).`
    );
  }

  return 0;
}

export default statusCommand;
