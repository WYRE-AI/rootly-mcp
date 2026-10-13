import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { isConfigured } from './client.js';
import { logger } from './utils/logger.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';

// Conduit service-to-service auth (gateway#377 parity). HTTP startup fails
// closed: an empty CONDUIT_S2S_SECRET, or a known placeholder, refuses to
// boot unless MCP_ALLOW_INSECURE_DEV=1 (placeholders never qualify). That
// bypass skips X-Gateway-S2S and binds 127.0.0.1 only. A configured secret
// is always enforced and still honors MCP_HTTP_HOST (default 0.0.0.0) so
// container deploys keep their existing bind. The secret value is never logged.
// See src/s2s-verify.ts.

/** Public example values. A copied placeholder must not verify as a real secret. */
const KNOWN_PLACEHOLDER_SECRETS = new Set([
  'replace-with-a-real-secret',
  'your-s2s-secret',
  'your-secret',
  'changeme',
  'change-me',
  'placeholder',
  'secret',
  'example',
  'replace-me',
  's2s-secret',
]);

const LOOPBACK_HOST = '127.0.0.1';

const MISSING_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is empty. ' +
  'Set CONDUIT_S2S_SECRET, or set MCP_ALLOW_INSECURE_DEV=1 for local development only.';

const PLACEHOLDER_S2S_SECRET_ERROR =
  'Refusing to start HTTP transport: CONDUIT_S2S_SECRET is a known placeholder. ' +
  'Generate a secret with `openssl rand -hex 32` and set CONDUIT_S2S_SECRET to that value. ' +
  'MCP_ALLOW_INSECURE_DEV does not bypass a placeholder secret.';

const INSECURE_DEV_WARNING =
  'SECURITY WARNING: CONDUIT_S2S_SECRET is empty and MCP_ALLOW_INSECURE_DEV=1. ' +
  'HTTP /mcp is not enforcing X-Gateway-S2S and is limited to loopback (127.0.0.1). ' +
  'Do not use this outside local development.';

const S2S_UNAUTHORIZED = {
  error:
    'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
};

const GATEWAY_CREDENTIALS_UNAUTHORIZED = {
  error: 'Unauthorized: missing required gateway credential header x-rootly-api-token',
};

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replace(/^\[(.+)\]$/, '$1');
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1';
}

function refuseStart(message: string): never {
  logger.error(message);
  process.exit(1);
}

/**
 * Secret for X-Gateway-S2S on /mcp. Read at HTTP startup, not module load.
 * Empty is fail-closed unless MCP_ALLOW_INSECURE_DEV=1. A known placeholder
 * always refuses, including when the dev flag is set. The secret is never logged.
 */
function resolveS2sSecret(): string {
  const secret = (process.env.CONDUIT_S2S_SECRET ?? '').trim();
  if (secret && KNOWN_PLACEHOLDER_SECRETS.has(secret.toLowerCase())) {
    refuseStart(PLACEHOLDER_S2S_SECRET_ERROR);
  }
  if (secret) return secret;

  if (process.env.MCP_ALLOW_INSECURE_DEV === '1') {
    // error level so LOG_LEVEL=warn|error cannot hide the bypass.
    logger.error(INSECURE_DEV_WARNING);
    return '';
  }

  refuseStart(MISSING_S2S_SECRET_ERROR);
}

/**
 * No secret (insecure-dev only) always binds 127.0.0.1. A non-loopback
 * MCP_HTTP_HOST is overridden and logged. A configured secret honors
 * MCP_HTTP_HOST, defaulting to 0.0.0.0 so container deploys stay unchanged.
 */
function resolveListenHost(s2sSecret: string): string {
  const configured = (process.env.MCP_HTTP_HOST ?? '').trim();
  if (s2sSecret) return configured || '0.0.0.0';

  if (configured && !isLoopbackHost(configured)) {
    logger.error(
      `WARNING: MCP_HTTP_HOST=${configured} is not a loopback address. ` +
        'MCP_ALLOW_INSECURE_DEV=1 without CONDUIT_S2S_SECRET cannot listen there. ' +
        `Binding ${LOOPBACK_HOST} only.`,
    );
  }
  return LOOPBACK_HOST;
}

export async function startHttpServer(): Promise<HttpServer> {
  const s2sSecret = resolveS2sSecret();
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = resolveListenHost(s2sSecret);
  const isGatewayMode = process.env.AUTH_MODE === 'gateway';

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check — unauthenticated liveness. Must NOT gate on credentials
    // (ACA probe carries none) or the container crash-loops. The body reports
    // only whether a token is configured, never the token itself.
    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        transport: 'http',
        credentials: { configured: isConfigured() },
        timestamp: new Date().toISOString(),
      }));
      return;
    }

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }));
      return;
    }

    // S2S guard runs first: a forged request must never reach credential
    // extraction or the MCP server/transport.
    if (s2sSecret && !verifyS2sHeader(headerValue(req.headers[S2S_HEADER]), s2sSecret)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(S2S_UNAUTHORIZED));
      return;
    }

    // Gateway mode: the Rootly token must arrive on every request via
    // x-rootly-api-token. Reject explicitly if it is missing rather than
    // falling through — falling through would resolve ROOTLY_API_TOKEN from
    // the process environment, which is not request-scoped (CWE-306).
    const headerToken = headerValue(req.headers['x-rootly-api-token']);
    if (isGatewayMode && !headerToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(GATEWAY_CREDENTIALS_UNAUTHORIZED));
      return;
    }

    // Create fresh server + transport per request (stateless).
    // Header token wins when present. Env mode with no header keeps the
    // process-lifetime ROOTLY_API_TOKEN path inside createServer().
    const server = createServer(headerToken);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      logger.info(`HTTP streaming server listening on ${host}:${port}`, { s2sEnforced: s2sSecret !== '' });
      resolve();
    });
  });

  return httpServer;
}

// Entry point — check transport mode. Vitest imports this module to call
// startHttpServer; skip the CLI entrypoint there. `node dist/http.js` still
// starts HTTP or falls through to stdio.
if (process.env.VITEST !== 'true') {
  if (process.env.MCP_TRANSPORT === 'http') {
    startHttpServer().catch((error) => {
      logger.error('Fatal startup error', error);
      process.exit(1);
    });
  } else {
    // Default: stdio (import index.ts)
    await import('./index.js');
  }
}
