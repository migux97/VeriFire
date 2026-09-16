// An error whose status and message are safe to show to the client. Any other error is logged and answered with a
// generic message (see errorResponse in http.ts).
export class HttpError extends Error {
  readonly status: number;
  // The same request may work later, so the browser keeps what the user scanned.
  readonly retryable: boolean;

  constructor(status: number, message: string, { retryable = false }: { retryable?: boolean } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.retryable = retryable;
  }
}
