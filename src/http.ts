import { createServer as createHttpServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from './server.js';
import { isConfigured } from './client.js';
import { logger } from './utils/logger.js';
import { verifyS2sHeader, S2S_HEADER } from './s2s-verify.js';

// Conduit service-to-service auth (gateway#377 parity). Non-empty =
// enforce X-Gateway-S2S on every /mcp request; empty = disabled, behavior
// exactly as before (dark-by-default until the gateway provisions this
// container's derived subkey). See src/s2s-verify.ts.
const S2S_SECRET = process.env.CONDUIT_S2S_SECRET || '';

export function startHttpServer(): void {
  const port = parseInt(process.env.MCP_HTTP_PORT || '8080', 10);
  const host = process.env.MCP_HTTP_HOST || '0.0.0.0';

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // Health check — unauthenticated
    if (url.pathname === '/health') {
      // liveness: must NOT gate on credentials/config (ACA probe carries none) or the container crash-loops
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

    // S2S guard runs first: a forged request must never reach the MCP
    // server/transport, where the first tool call would touch credentials.
    if (S2S_SECRET && !verifyS2sHeader(req.headers[S2S_HEADER] as string | undefined, S2S_SECRET)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error:
            'Missing or invalid X-Gateway-S2S header: this endpoint only accepts requests signed by the gateway.',
        }),
      );
      return;
    }

    // Create fresh server + transport per request (stateless)
    const server = createServer();
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

  httpServer.listen(port, host, () => {
    logger.info(`HTTP streaming server listening on ${host}:${port}`, { s2sEnforced: S2S_SECRET !== '' });
  });
}

// Entry point — check transport mode
if (process.env.MCP_TRANSPORT === 'http') {
  startHttpServer();
} else {
  // Default: stdio (import index.ts)
  await import('./index.js');
}
