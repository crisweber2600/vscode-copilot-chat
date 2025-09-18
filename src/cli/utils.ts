import { resolve } from 'node:path';
import type { ParsedArgs } from './types';

export function parseArgs(args: string[]): ParsedArgs {
  const flags: Record<string, string | boolean | string[]> = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];
    const hasValue = next !== undefined && !next.startsWith('-');
    const value = hasValue ? next : true;
    if (hasValue) {
      i += 1;
    }

    if (Object.prototype.hasOwnProperty.call(flags, key)) {
      const current = flags[key];
      if (Array.isArray(current)) {
        current.push(String(value));
      } else {
        flags[key] = [String(current), String(value)];
      }
    } else {
      flags[key] = value;
    }
  }

  return { positionals, flags };
}

export function getStringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return value[value.length - 1] as string;
  }
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
}

export function getStringArrayFlag(parsed: ParsedArgs, name: string): string[] {
  const value = parsed.flags[name];
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  return [String(value)];
}

export function getBooleanFlag(parsed: ParsedArgs, name: string): boolean {
  const value = parsed.flags[name];
  if (Array.isArray(value)) {
    return Boolean(value[value.length - 1]);
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false;
    }
  }
  return false;
}

export function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(parsed.flags, name);
}

export function resolveOutputFormat(parsed: ParsedArgs, preferJson: boolean): 'json' | 'text' {
  if (hasFlag(parsed, 'json')) {
    return 'json';
  }
  if (hasFlag(parsed, 'text')) {
    return 'text';
  }
  return preferJson ? 'json' : 'text';
}

export function writeJson(stream: NodeJS.WriteStream, payload: unknown, pretty = false): void {
  const spacing = pretty ? 2 : 0;
  const serialized = JSON.stringify(payload, null, spacing);
  stream.write(`${serialized}\n`);
}

export function writeLine(stream: NodeJS.WriteStream, message: string): void {
  stream.write(`${message}\n`);
}

export function resolvePath(baseDir: string, input: string): string {
  if (!input) {
    return baseDir;
  }
  return resolve(baseDir, input);
}
