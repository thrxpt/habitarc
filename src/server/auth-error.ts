export class AuthError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export const authenticationError = (error: unknown): AuthError =>
  error instanceof AuthError
    ? error
    : new AuthError(503, "Authentication temporarily unavailable");

export const authenticationErrorResponse = (error: unknown): Response => {
  const failure = authenticationError(error);
  return new Response(failure.message, { status: failure.status });
};
