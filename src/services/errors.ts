export class ServiceError extends Error {
  constructor(message: string, public readonly exitCode: number, cause?: unknown) {
    super(message);
    this.name = new.target.name;
    if (cause) {
      (this as Error).cause = cause;
    }
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string) {
    super(message, 2);
  }
}

export class AuthError extends ServiceError {
  constructor(message: string) {
    super(message, 3);
  }
}

export class PolicyError extends ServiceError {
  constructor(message: string) {
    super(message, 4);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string) {
    super(message, 5);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string) {
    super(message, 6);
  }
}

export class CancelledError extends ServiceError {
  constructor(message: string) {
    super(message, 7);
  }
}

export class ProviderError extends ServiceError {
  constructor(message: string) {
    super(message, 8);
  }
}

export class UnexpectedError extends ServiceError {
  constructor(message: string, cause?: unknown) {
    super(message, 9, cause);
  }
}

export function isServiceError(error: unknown): error is ServiceError {
  return error instanceof ServiceError;
}
