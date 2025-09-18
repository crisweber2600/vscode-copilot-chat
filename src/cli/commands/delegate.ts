import { existsSync, statSync } from 'node:fs';
import {
  type DelegationRequest,
  validateContextRefs,
  validateDelegationRequest,
} from '../../models/cliDelegation';
import { ValidationError } from '../../services/errors';
import { detectRepository } from '../repository';
import type { CliContext } from '../types';
import {
  getStringArrayFlag,
  getStringFlag,
  hasFlag,
  parseArgs,
  resolveOutputFormat,
  resolvePath,
  writeJson,
  writeLine,
} from '../utils';

interface DelegateOptions {
  prompt: string;
  files: string[];
  folders: string[];
  approvals: string[];
  mode: 'interactive' | 'non-interactive';
  output: 'json' | 'text';
  quiet: boolean;
}

export async function delegateCommand(args: string[], context: CliContext): Promise<number> {
  const parsed = parseArgs(args);
  const prompt = (getStringFlag(parsed, 'prompt') ?? parsed.positionals[0] ?? '').trim();

  if (!prompt) {
    throw new ValidationError('A prompt is required to delegate a task.');
  }

  await context.authService.requireSession();

  const interactiveFlag = hasFlag(parsed, 'interactive');
  const nonInteractiveFlag = hasFlag(parsed, 'non-interactive');
  if (interactiveFlag && nonInteractiveFlag) {
    throw new ValidationError('Select either --interactive or --non-interactive, not both.');
  }

  const mode: 'interactive' | 'non-interactive' = nonInteractiveFlag
    ? 'non-interactive'
    : 'interactive';

  const files = getStringArrayFlag(parsed, 'file').map((file) => resolvePath(context.cwd, file));
  const folders = getStringArrayFlag(parsed, 'folder').map((folder) => resolvePath(context.cwd, folder));
  const approvals = getStringArrayFlag(parsed, 'approve');
  const quiet = hasFlag(parsed, 'quiet');
  const output = resolveOutputFormat(parsed, quiet ? true : context.ciDefaultJson);

  const options: DelegateOptions = { prompt, files, folders, approvals, mode, output, quiet };

  const repository = await detectRepository({ cwd: context.cwd, env: context.env });
  if (!repository && context.sessionService.isRemote() && !context.env.COPILOT_CLI_TEST_MODE) {
    throw new ValidationError(
      'Unable to detect GitHub repository information. Run from a Git repository or set GITHUB_REPOSITORY and GITHUB_REF.'
    );
  }
  const request = createDelegationRequest(options, repository);
  validateInputContext(request, options);

  const session = await context.sessionService.create(request);

  if (options.quiet) {
    writeLine(context.stdout, session.id);
    return 0;
  }

  if (options.output === 'json') {
    writeJson(context.stdout, {
      id: session.id,
      status: session.status,
      createdAt: session.createdAt,
    });
  } else {
    writeLine(context.stdout, `Delegated session ${session.id} (status: ${session.status}).`);
  }

  return 0;
}

function createDelegationRequest(
  options: DelegateOptions,
  repository?: Awaited<ReturnType<typeof detectRepository>>
): DelegationRequest {
  const contextRefs = [...options.files, ...options.folders];
  return {
    prompt: options.prompt,
    contextRefs,
    mode: options.mode,
    approvals: options.approvals,
    output: options.output,
    quiet: options.quiet,
    repository: repository ? { ...repository } : undefined,
  };
}

function validateInputContext(request: DelegationRequest, options: DelegateOptions): void {
  const validation = validateDelegationRequest(request);
  if (!validation.valid) {
    throw new ValidationError(validation.reason);
  }

  const missing: string[] = [];
  for (const file of options.files) {
    if (!existsSync(file) || !statSync(file).isFile()) {
      missing.push(file);
    }
  }
  for (const folder of options.folders) {
    if (!existsSync(folder) || !statSync(folder).isDirectory()) {
      missing.push(folder);
    }
  }

  if (missing.length > 0) {
    throw new ValidationError(`Missing context references: ${missing.join(', ')}`);
  }

  const contextValidation = validateContextRefs(request.contextRefs, (path) => existsSync(path));
  if (!contextValidation.valid) {
    throw new ValidationError(contextValidation.reason);
  }
}

export default delegateCommand;
