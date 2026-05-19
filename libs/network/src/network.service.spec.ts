/**
 * @file Unit tests for NetworkService — fetch wrapper, timeout, JSON, error types.
 * @module @ghostless/network
 */

import { NetworkService } from './network.service';
import { NetworkHttpError, NetworkTimeoutError } from './network.errors';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function mockFetchOnce(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  global.fetch = jest.fn(impl as unknown as typeof fetch) as unknown as typeof fetch;
}

function makeResponse(body: string, init: { status?: number; contentType?: string } = {}): Response {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { 'content-type': init.contentType ?? 'application/json' },
  });
}

describe('NetworkService', () => {
  it('parses JSON response and returns wrapped data', async () => {
    mockFetchOnce(async () => makeResponse(JSON.stringify({ ok: true, value: 42 })));
    const net = new NetworkService(1_000);
    const res = await net.request<{ ok: boolean; value: number }>('http://x');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ ok: true, value: 42 });
  });

  it('parses text response when content-type is not JSON', async () => {
    mockFetchOnce(async () => makeResponse('plain text', { contentType: 'text/plain' }));
    const net = new NetworkService(1_000);
    const res = await net.request<string>('http://x');
    expect(res.data).toBe('plain text');
  });

  it('throws NetworkHttpError on non-2xx and includes status + body', async () => {
    mockFetchOnce(async () => makeResponse('not found', { status: 404, contentType: 'text/plain' }));
    const net = new NetworkService(1_000);
    await expect(net.getJson('http://x')).rejects.toMatchObject({
      name: 'NetworkHttpError',
      status: 404,
      body: 'not found',
    });
  });

  it('throws NetworkTimeoutError when the abort fires', async () => {
    mockFetchOnce(async (_url, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const net = new NetworkService(20); // 20ms timeout to keep test fast
    await expect(net.getJson('http://x')).rejects.toBeInstanceOf(NetworkTimeoutError);
  });

  it('postJson sends body and Content-Type and parses response', async () => {
    let captured: { url?: string; body?: string; headers?: Record<string, string>; method?: string } = {};
    mockFetchOnce(async (url, init) => {
      captured = {
        url,
        method: init?.method,
        body: init?.body as string,
        headers: init?.headers as Record<string, string>,
      };
      return makeResponse(JSON.stringify({ echoed: true }));
    });
    const net = new NetworkService(1_000);
    const data = await net.postJson<{ echoed: boolean }>('http://x', { hello: 'world' }, { bearer: 'tok' });
    expect(captured.url).toBe('http://x');
    expect(captured.method).toBe('POST');
    expect(captured.body).toBe(JSON.stringify({ hello: 'world' }));
    expect(captured.headers!['Content-Type']).toBe('application/json');
    expect(captured.headers!.Authorization).toBe('Bearer tok');
    expect(data.echoed).toBe(true);
  });
});
