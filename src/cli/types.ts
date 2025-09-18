import type { AuthService } from '../services/authService';
import type { SessionService } from '../services/sessionService';

export interface CliContext {
  readonly authService: AuthService;
  readonly sessionService: SessionService;
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly env: NodeJS.ProcessEnv;
  readonly cwd: string;
  readonly agentHome: string;
  readonly ciDefaultJson: boolean;
  readonly verbose: boolean;
}

export interface CommandHandler {
  (args: string[], context: CliContext): Promise<number>;
}

export interface ParsedArgs {
  readonly positionals: string[];
  readonly flags: Record<string, string | boolean | string[]>;
}
