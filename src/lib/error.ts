export class AnyError extends Error {
  override readonly name: string = "AnyError";
  override readonly cause?: AnyError | Error;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = isError(cause) ? cause : undefined;
  }
}

export class RepositoryError extends AnyError {
  override readonly name: string = "RepositoryError";
}

export class ApplicationError extends AnyError {
  override readonly name: string = "ApplicationError";
}

export function isError(error: unknown): error is AnyError | Error {
  return error instanceof Error || error instanceof AnyError;
}

export function fromUnknown(error: unknown): AnyError {
  if (error instanceof Error) {
    if (error instanceof AnyError) {
      return error;
    }

    return new AnyError(error.message, error);
  }

  if (typeof error === "string") {
    return new AnyError(error);
  }

  return new AnyError("Unknown error occurred", error);
}
