export class ClassificationError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly safeDetail: string = message,
  ) {
    super(message);
    this.name = "ClassificationError";
  }
}

export function errorCodeOf(error: unknown): string {
  return error instanceof ClassificationError ? error.code : "UNEXPECTED_CLASSIFICATION_FAILURE";
}
