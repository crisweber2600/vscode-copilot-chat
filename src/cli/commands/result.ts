import { ValidationError } from '../../services/errors';
import type { CliContext } from '../types';
import { parseArgs, resolveOutputFormat, writeJson, writeLine } from '../utils';

export async function resultCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const id = parsed.positionals[0];

  if (!id) {
    throw new ValidationError('Session id is required.');
  }

  await context.authService.requireSession();

  const format = resolveOutputFormat(parsed, context.ciDefaultJson);
  const session = await context.sessionService.getResult(id);

  const payload = {
    id: session.id,
    status: session.status,
    summary: session.summary ?? '',
    artifacts: session.artifacts,
  };

  if (format === 'json') {
    writeJson(context.stdout, payload);
  } else {
    writeLine(context.stdout, `Summary: ${payload.summary}`);
    if (payload.artifacts.length > 0) {
      payload.artifacts.forEach((artifact) => writeLine(context.stdout, `Artifact: ${artifact}`));
    }
  }

  return 0;
}

export default resultCommand;
