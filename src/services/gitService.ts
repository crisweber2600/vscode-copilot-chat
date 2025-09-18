import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitError extends Error {
  constructor(message: string, readonly result: GitCommandResult, readonly command: string[]) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitServiceOptions {
  cwd: string;
}

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };
}

export class GitService {
  private readonly cwd: string;

  constructor(options: GitServiceOptions) {
    if (!options.cwd) {
      throw new Error('GitService requires a working directory.');
    }
    this.cwd = options.cwd;
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.run(['rev-parse', '--abbrev-ref', 'HEAD']);
    return result.stdout.trim();
  }

  async hasUncommittedChanges(): Promise<boolean> {
    const result = await this.run(['status', '--porcelain']);
    return result.stdout.trim().length > 0;
  }

  async remoteBranchExists(remote: string, branch: string): Promise<boolean> {
    const result = await this.run(['ls-remote', '--heads', remote, branch], { allowFailure: true });
    return result.exitCode === 0 && result.stdout.trim().length > 0;
  }

  async pushBranch(remote: string, branch: string): Promise<void> {
    await this.run(['push', remote, `${branch}:${branch}`, '--set-upstream']);
  }

  async createCheckpointBranch(options: { remote: string; commitMessage?: string }): Promise<{ headRef: string; log: string[] }> {
    const currentBranch = await this.getCurrentBranch();
    if (!currentBranch) {
      throw new Error('Unable to resolve current Git branch.');
    }

    const branchPrefix = 'copilot/cli-';
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .replace(/\..+$/, '');
    const headRef = `${branchPrefix}${timestamp}`;
    const logs: string[] = [];

    try {
      await this.run(['checkout', '-b', headRef]);
      logs.push(`Created checkpoint branch ${headRef}.`);
      await this.run(['add', '--all']);
      await this.run(['commit', '-m', options.commitMessage ?? 'Checkpoint from Copilot CLI for coding agent session']);
      logs.push(`Committed pending changes to ${headRef}.`);
      await this.run(['push', options.remote, `${headRef}:${headRef}`, '--set-upstream']);
      logs.push(`Pushed ${headRef} to ${options.remote}.`);
      return { headRef, log: logs };
    } catch (error) {
      await this.safeCheckout(currentBranch);
      await this.safeDeleteBranch(headRef);
      throw this.wrapGitError(error, 'Failed to create checkpoint branch. Ensure git user.name and user.email are set.');
    } finally {
      const activeBranch = await this.getCurrentBranch();
      if (activeBranch !== currentBranch) {
        await this.safeCheckout(currentBranch);
      }
    }
  }

  private async safeCheckout(branch: string): Promise<void> {
    try {
      await this.run(['checkout', branch]);
    } catch {
      // ignore
    }
  }

  private async safeDeleteBranch(branch: string): Promise<void> {
    try {
      await this.run(['branch', '-D', branch]);
    } catch {
      // ignore
    }
  }

  private async run(args: string[], options?: { allowFailure?: boolean }): Promise<GitCommandResult> {
    try {
      const { stdout, stderr } = await execFileAsync('git', args, {
        cwd: this.cwd,
        env: gitEnv(),
      });
      return { stdout, stderr, exitCode: 0 };
    } catch (error) {
      const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
      const stdout = execError.stdout ?? '';
      const stderr = execError.stderr ?? '';
      const exitCode = typeof execError.code === 'number' ? execError.code : 1;

      if (options?.allowFailure) {
        return { stdout, stderr, exitCode };
      }

      throw new GitError(stderr.trim() || execError.message || `git ${args.join(' ')}`, { stdout, stderr, exitCode }, args);
    }
  }

  private wrapGitError(error: unknown, message: string): GitError {
    if (error instanceof GitError) {
      const detail = error.result.stderr.trim() || error.result.stdout.trim();
      const nextMessage = detail ? `${message} ${detail}` : message;
      return new GitError(nextMessage, error.result, error.command);
    }

    if (error instanceof Error) {
      const errno = (error as NodeJS.ErrnoException).code;
      const supplemental = errno === 'ENOENT' ? 'Git does not appear to be installed or is not available on PATH.' : '';
      const combined = [message, error.message, supplemental].filter(Boolean).join(' ');
      return new GitError(combined.trim(), { stdout: '', stderr: error.message, exitCode: 1 }, []);
    }

    return new GitError(message, { stdout: '', stderr: '', exitCode: 1 }, []);
  }
}
