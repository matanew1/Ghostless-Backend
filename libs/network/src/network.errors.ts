/**
 * @file Typed errors produced by the network service.
 * @module @ghostless/network
 */

/** Base class so callers can `instanceof NetworkError` to catch all variants. */
export class NetworkError extends Error {
  constructor(message: string, public readonly url: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Thrown when the request was aborted by a per-request or service-default timeout. */
export class NetworkTimeoutError extends NetworkError {
  constructor(url: string, public readonly timeoutMs: number) {
    super(`Request to ${url} timed out after ${timeoutMs}ms`, url);
    this.name = 'NetworkTimeoutError';
  }
}

/** Thrown when the server returned a non-2xx status. */
export class NetworkHttpError extends NetworkError {
  constructor(
    url: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`HTTP ${status} from ${url}`, url);
    this.name = 'NetworkHttpError';
  }
}
