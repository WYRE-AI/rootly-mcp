/**
 * Thin adapter — exposes raw request functions used by domain handlers,
 * delegating to @wyre-technology/node-rootly for the actual HTTP layer.
 *
 * Domain handlers import from here; the underlying implementation lives
 * in the node-rootly client library.
 */
import { request as _request } from '@wyre-technology/node-rootly';

export { RootlyClient } from '@wyre-technology/node-rootly';
export {
  RootlyError, AuthenticationError, ForbiddenError, NotFoundError,
  ValidationError, RateLimitError, ServerError,
} from '@wyre-technology/node-rootly';

/**
 * `tokenOverride` is the request-scoped gateway-mode token, threaded
 * explicitly through every call from `worker.ts`/`server.ts` down through
 * each domain handler. Falls back to `process.env.ROOTLY_API_TOKEN` only
 * for the stdio/env-mode path, where there's a single process-lifetime
 * token and no concurrent multi-tenant requests to race.
 *
 * Previously this read `process.env.ROOTLY_API_TOKEN` unconditionally, and
 * `worker.ts` mutated that same global per-request to inject the gateway
 * token — a shared-global race under concurrent Worker requests for
 * different tenants. Explicit parameter-threading (not AsyncLocalStorage)
 * to stay consistent with this org's established fix for other Cloudflare
 * Worker MCP sidecars (e.g. connectwise-automate-mcp, mimecast-mcp).
 */
export function getToken(tokenOverride?: string): string {
  const token = tokenOverride ?? process.env.ROOTLY_API_TOKEN;
  if (!token) throw new Error('ROOTLY_API_TOKEN environment variable is not set.');
  return token;
}

export function isConfigured(tokenOverride?: string): boolean {
  return !!(tokenOverride ?? process.env.ROOTLY_API_TOKEN);
}

export async function rootlyGet(path: string, params?: Record<string, string>, token?: string): Promise<unknown> {
  return _request(getToken(token), path, { params });
}

export async function rootlyPost(path: string, data: unknown, token?: string): Promise<unknown> {
  return _request(getToken(token), path, { method: 'POST', body: data });
}

export async function rootlyPatch(path: string, data: unknown, token?: string): Promise<unknown> {
  return _request(getToken(token), path, { method: 'PATCH', body: data });
}

export async function rootlyPut(path: string, data: unknown, token?: string): Promise<unknown> {
  return _request(getToken(token), path, { method: 'PUT', body: data });
}

export async function rootlyDelete(path: string, token?: string): Promise<unknown> {
  return _request(getToken(token), path, { method: 'DELETE' });
}
