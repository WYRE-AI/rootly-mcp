import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './utils/logger.js';

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
process.stdin.resume();

try {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Rootly MCP server started (stdio)');
} catch (error) {
  logger.error('Failed to start server', error);
  process.exit(1);
}

