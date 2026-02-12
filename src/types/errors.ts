export class AppError extends Error {
  readonly code: string;
  readonly cause?: unknown;
  /** Extra structured data from the backend (e.g. estimatedDataPoints, areaKm2). */
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, cause?: unknown, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.cause = cause;
    this.details = details ?? {};
  }
}
