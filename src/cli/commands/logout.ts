import type { CliContext } from '../types';
import { parseArgs, resolveOutputFormat, writeJson, writeLine } from '../utils';

export async function logoutCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const format = resolveOutputFormat(parsed, context.ciDefaultJson);

  await context.authService.logout();

  const payload = { status: 'unauthenticated' as const };

  if (format === 'json') {
    writeJson(context.stdout, payload);
  } else {
    writeLine(context.stdout, 'Signed out.');
  }

  return 0;
}

export default logoutCommand;
