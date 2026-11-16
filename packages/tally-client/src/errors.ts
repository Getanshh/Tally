/**
 * Typed errors. Every error message is meant to be readable by a non-developer
 * (it may be relayed by Claude or shown in the approval app). Never swallow these.
 */
export class TallyError extends Error {
  constructor(
    message: string,
    public readonly code: TallyErrorCode,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TallyError";
  }
}

export type TallyErrorCode =
  | "UNREACHABLE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "BAD_RESPONSE"
  | "TALLY_ERROR"
  | "INVALID_INPUT"
  | "WRITE_FORBIDDEN";

export class TallyUnreachableError extends TallyError {
  constructor(url: string, cause?: unknown) {
    super(
      `Tally is not reachable at ${url}. Check that TallyPrime is running, a company is open, and the XML port (F1 > Settings > Connectivity) is enabled.`,
      "UNREACHABLE",
      { cause },
    );
    this.name = "TallyUnreachableError";
  }
}

export class TallyTimeoutError extends TallyError {
  constructor(url: string, timeoutMs: number) {
    super(
      `Tally at ${url} did not respond within ${timeoutMs} ms. Tally may be busy (e.g. a report or backup is running) — try again shortly.`,
      "TIMEOUT",
    );
    this.name = "TallyTimeoutError";
  }
}

export class TallyHttpError extends TallyError {
  constructor(
    public readonly status: number,
    body: string,
  ) {
    super(`Tally returned HTTP ${status}: ${body.slice(0, 300)}`, "HTTP_ERROR");
    this.name = "TallyHttpError";
  }
}

/** Tally answered, but with an error message instead of data. */
export class TallyResponseError extends TallyError {
  constructor(
    message: string,
    public readonly rawResponse: string,
  ) {
    super(`Tally reported an error: ${message}`, "TALLY_ERROR");
    this.name = "TallyResponseError";
  }
}

export class TallyBadResponseError extends TallyError {
  constructor(
    message: string,
    public readonly rawResponse: string,
  ) {
    super(`Could not understand Tally's response: ${message}`, "BAD_RESPONSE");
    this.name = "TallyBadResponseError";
  }
}

export class TallyInputError extends TallyError {
  constructor(message: string) {
    super(message, "INVALID_INPUT");
    this.name = "TallyInputError";
  }
}

export class TallyWriteForbiddenError extends TallyError {
  constructor(message: string) {
    super(message, "WRITE_FORBIDDEN");
    this.name = "TallyWriteForbiddenError";
  }
}
