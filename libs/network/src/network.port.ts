/**
 * @file Port and DI token for the shared HTTP client.
 * @module @ghostless/network
 */

/** Nest provider token for {@link INetworkService}. */
export const NETWORK_SERVICE = Symbol('NETWORK_SERVICE');

/** Per-request options. */
export interface NetworkRequestOptions {
  /** HTTP method. Defaults to GET (or POST when `json` is set). */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Extra headers; merged over auth/content-type defaults. */
  headers?: Record<string, string>;
  /** JSON body — serialized and sent with `Content-Type: application/json`. */
  json?: unknown;
  /** Raw body (string or Buffer). Ignored when `json` is set. */
  body?: string;
  /** Bearer token shorthand; merges into `Authorization` header. */
  bearer?: string;
  /** Per-request timeout in ms; overrides the service default. */
  timeoutMs?: number;
  /** Pre-built AbortSignal; if provided, takes precedence over `timeoutMs`. */
  signal?: AbortSignal;
}

/** Parsed response envelope returned by {@link INetworkService}. */
export interface NetworkResponse<T> {
  status: number;
  ok: boolean;
  headers: Headers;
  data: T;
}

/**
 * HTTP client abstraction wrapping the runtime `fetch` with timeouts,
 * JSON handling, and uniform error semantics.
 */
export interface INetworkService {
  /** Generic request returning a {@link NetworkResponse}. */
  request<T = unknown>(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>>;

  /** Shorthand: GET JSON, throw on non-2xx. */
  getJson<T = unknown>(url: string, options?: NetworkRequestOptions): Promise<T>;

  /** Shorthand: POST JSON, throw on non-2xx. */
  postJson<T = unknown>(url: string, body: unknown, options?: NetworkRequestOptions): Promise<T>;
}
