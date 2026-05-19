/**
 * @file Default fetch-backed implementation of {@link INetworkService}.
 * @module @ghostless/network
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  INetworkService,
  NetworkRequestOptions,
  NetworkResponse,
} from './network.port';
import { NetworkHttpError, NetworkTimeoutError } from './network.errors';

/** Service-wide default timeout when no per-request value is given. */
export const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Thin wrapper over global `fetch` providing timeouts, JSON helpers,
 * and uniform error types so callers never deal with raw `Response`.
 */
@Injectable()
export class NetworkService implements INetworkService {
  private readonly logger = new Logger(NetworkService.name);

  constructor(private readonly defaultTimeoutMs = DEFAULT_TIMEOUT_MS) {}

  /** @inheritdoc */
  async request<T = unknown>(
    url: string,
    options: NetworkRequestOptions = {},
  ): Promise<NetworkResponse<T>> {
    const method = options.method ?? (options.json !== undefined ? 'POST' : 'GET');
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.bearer) headers.Authorization = `Bearer ${options.bearer}`;

    let body: string | undefined = options.body;
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['Content-Type'] ??= 'application/json';
    }

    const { signal, cancel } = this.buildSignal(options);
    try {
      const res = await fetch(url, { method, headers, body, signal });
      const data = await this.parseBody<T>(res);
      if (!res.ok) {
        throw new NetworkHttpError(url, res.status, typeof data === 'string' ? data : JSON.stringify(data));
      }
      return { status: res.status, ok: res.ok, headers: res.headers, data };
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const ms = options.timeoutMs ?? this.defaultTimeoutMs;
        throw new NetworkTimeoutError(url, ms);
      }
      throw err;
    } finally {
      cancel();
    }
  }

  /** @inheritdoc */
  async getJson<T = unknown>(url: string, options: NetworkRequestOptions = {}): Promise<T> {
    const res = await this.request<T>(url, { ...options, method: 'GET' });
    return res.data;
  }

  /** @inheritdoc */
  async postJson<T = unknown>(
    url: string,
    body: unknown,
    options: NetworkRequestOptions = {},
  ): Promise<T> {
    const res = await this.request<T>(url, { ...options, method: 'POST', json: body });
    return res.data;
  }

  /** Returns either the caller's signal or one driven by `timeoutMs`. */
  private buildSignal(options: NetworkRequestOptions): { signal: AbortSignal; cancel: () => void } {
    if (options.signal) return { signal: options.signal, cancel: () => {} };
    const controller = new AbortController();
    const ms = options.timeoutMs ?? this.defaultTimeoutMs;
    const timer = setTimeout(() => controller.abort(), ms);
    return { signal: controller.signal, cancel: () => clearTimeout(timer) };
  }

  /** Parses JSON when the Content-Type says so, otherwise returns text. */
  private async parseBody<T>(res: Response): Promise<T> {
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  }
}
