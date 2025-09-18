import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RepositoryMetadata } from '../models/cliDelegation';

const execFileAsync = promisify(execFile);

export interface RepositoryDetectionOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export async function detectRepository(options: RepositoryDetectionOptions): Promise<RepositoryMetadata | undefined> {
  const fromEnv = detectFromGithubActions(options);
  if (fromEnv) {
    return fromEnv;
  }

  const fromGit = await detectFromGit(options.cwd);
  return fromGit ?? undefined;
}

function detectFromGithubActions(options: RepositoryDetectionOptions): RepositoryMetadata | undefined {
  const { env, cwd } = options;
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) {
    return undefined;
  }

  const [owner, repo] = repository.split('/');
  if (!owner || !repo) {
    return undefined;
  }

  const branch = parseGithubRef(env.GITHUB_HEAD_REF ?? env.GITHUB_REF) ?? 'main';
  const remoteUrl = `https://github.com/${owner}/${stripGitSuffix(repo)}`;

  return {
    provider: 'github',
    owner,
    repo: stripGitSuffix(repo),
    branch,
    remoteUrl,
    remoteName: env.COPILOT_CLI_REMOTE_NAME?.trim() || 'origin',
    workspacePath: env.GITHUB_WORKSPACE ?? cwd,
  };
}

function parseGithubRef(ref?: string): string | undefined {
  if (!ref) {
    return undefined;
  }
  if (ref.startsWith('refs/heads/')) {
    return ref.slice('refs/heads/'.length);
  }
  if (ref.startsWith('refs/remotes/')) {
    return ref.slice('refs/remotes/'.length);
  }
  if (ref.startsWith('refs/pull/')) {
    const parts = ref.split('/');
    if (parts.length >= 3) {
      return `${parts[2]} (pull)`;
    }
  }
  return ref;
}

async function detectFromGit(cwd: string): Promise<RepositoryMetadata | undefined> {
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
  } catch {
    return undefined;
  }

  const remoteUrl = await tryGitCommand(['config', '--get', 'remote.origin.url'], cwd);
  if (!remoteUrl) {
    return undefined;
  }

  const parsed = parseGitRemote(remoteUrl.trim());
  if (!parsed) {
    return undefined;
  }

  const branch = (await tryGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], cwd))?.trim() ?? 'HEAD';
  const workspacePath = (await tryGitCommand(['rev-parse', '--show-toplevel'], cwd))?.trim() ?? cwd;
  const remoteName =
    (await tryGitCommand(['config', '--get', `branch.${branch}.remote`], cwd))?.trim() ||
    envRemoteName() ||
    'origin';

  return {
    provider: 'github',
    owner: parsed.owner,
    repo: parsed.repo,
    branch,
    remoteUrl: remoteUrl.trim(),
    workspacePath,
    remoteName,
  };
}

function envRemoteName(): string | undefined {
  const value = process.env.COPILOT_CLI_REMOTE_NAME?.trim();
  return value && value.length > 0 ? value : undefined;
}

async function tryGitCommand(args: string[], cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd });
    return stdout.trim();
  } catch {
    return undefined;
  }
}

function parseGitRemote(remote: string): { owner: string; repo: string } | undefined {
  const cleaned = remote.replace(/\.git$/i, '');

  let match = cleaned.match(/^https?:\/\/github\.com\/([^/]+)\/(.+)$/i);
  if (!match) {
    match = cleaned.match(/^git@github\.com:([^/]+)\/(.+)$/i);
  }

  if (!match) {
    return undefined;
  }

  const owner = match[1];
  const repo = match[2];

  if (!owner || !repo) {
    return undefined;
  }

  return { owner, repo: stripGitSuffix(repo) };
}

function stripGitSuffix(value: string): string {
  return value.replace(/\.git$/i, '');
}
