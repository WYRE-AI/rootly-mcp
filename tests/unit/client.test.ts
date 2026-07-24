import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server.js';
import { getToken, isConfigured, rootlyGet } from '../../src/client.js';

const BASE = 'https://api.rootly.com/v1';

describe('getToken', () => {
  it('throws when neither an override nor process.env.ROOTLY_API_TOKEN is set', () => {
    const saved = process.env.ROOTLY_API_TOKEN;
    delete process.env.ROOTLY_API_TOKEN;
    expect(() => getToken()).toThrow(/ROOTLY_API_TOKEN/);
    if (saved !== undefined) process.env.ROOTLY_API_TOKEN = saved;
  });

  it('prefers the override over process.env', () => {
    const saved = process.env.ROOTLY_API_TOKEN;
    process.env.ROOTLY_API_TOKEN = 'env-token';
    expect(getToken('override-token')).toBe('override-token');
    if (saved === undefined) delete process.env.ROOTLY_API_TOKEN;
    else process.env.ROOTLY_API_TOKEN = saved;
  });

  it('falls back to process.env when no override is given', () => {
    const saved = process.env.ROOTLY_API_TOKEN;
    process.env.ROOTLY_API_TOKEN = 'env-token';
    expect(getToken()).toBe('env-token');
    if (saved === undefined) delete process.env.ROOTLY_API_TOKEN;
    else process.env.ROOTLY_API_TOKEN = saved;
  });
});

describe('isConfigured', () => {
  it('is true with an override even when process.env is unset', () => {
    const saved = process.env.ROOTLY_API_TOKEN;
    delete process.env.ROOTLY_API_TOKEN;
    expect(isConfigured('override-token')).toBe(true);
    if (saved !== undefined) process.env.ROOTLY_API_TOKEN = saved;
  });
});

describe('request-scoped token — cross-tenant isolation', () => {
  it("does not contaminate a concurrent request with another tenant's token", async () => {
    // Each request echoes back the Authorization header it actually
    // received, so we can prove — via the real fetch path, not a mock of
    // rootlyGet itself — that concurrent calls with different tokenOverride
    // values never observe each other's credentials. This is the shape of
    // test that would have failed under the old implementation, where
    // worker.ts wrote the gateway token to process.env.ROOTLY_API_TOKEN and
    // every call (regardless of which tenant's request triggered it) read
    // that same shared global.
    server.use(
      http.get(`${BASE}/echo-auth`, ({ request }) => {
        return HttpResponse.json({ auth: request.headers.get('Authorization') });
      })
    );

    const [resultA, resultB] = await Promise.all([
      (async () => {
        // Stagger so B's request is in flight while A's is still pending —
        // the old process.env-mutation implementation would let B's write
        // clobber the token A's fetch call reads.
        await new Promise((r) => setTimeout(r, 10));
        return rootlyGet('/echo-auth', undefined, 'tenant-a-token') as Promise<{ auth: string }>;
      })(),
      rootlyGet('/echo-auth', undefined, 'tenant-b-token') as Promise<{ auth: string }>,
    ]);

    expect(resultA.auth).toBe('Bearer tenant-a-token');
    expect(resultB.auth).toBe('Bearer tenant-b-token');
  });
});
