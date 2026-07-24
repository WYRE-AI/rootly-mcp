import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

interface Env {
  ROOTLY_API_TOKEN: string;
  LOG_LEVEL?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check — unauthenticated
    if (url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          transport: 'cloudflare-worker',
          timestamp: new Date().toISOString(),
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (url.pathname !== '/mcp') {
      return new Response(JSON.stringify({ error: 'Not found', endpoints: ['/mcp', '/health'] }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Stateless: one transport per request
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    // Thread the token through as a parameter rather than writing it to
    // process.env — a process-global mutated per-request is a race under
    // concurrent Worker invocations (same anti-pattern fixed this week in
    // other conduit-prod vendor sidecars).
    const server = createServer(env.ROOTLY_API_TOKEN);
    await server.connect(transport);

    logger.info('Cloudflare Worker handling request');
    return transport.handleRequest(request);
  },
} satisfies ExportedHandler<Env>;
