import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  getState, getNavigationTools, getBackTool, DOMAIN_DESCRIPTIONS,
} from './domains/navigation.js';
import { getDomainHandler } from './domains/index.js';
import { isConfigured } from './client.js';
import { elicitTokenIfMissing } from './elicitation/forms.js';
import { logger } from './utils/logger.js';
import type { DomainName } from './utils/types.js';

const NAVIGATION_TOOLS = ['rootly_status', 'rootly_navigate', 'rootly_back'];

export function createServer(): Server {
  const server = new Server(
    { name: 'rootly-mcp', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  // Dynamic tool list — based on navigation state
  server.setRequestHandler(ListToolsRequestSchema, async (_request, extra) => {
    const sessionId = (extra as Record<string, unknown>)?.sessionId as string || 'default';
    const state = getState(sessionId);

    if (!state.currentDomain) {
      // Show navigation tools only
      return { tools: getNavigationTools() };
    }

    // Show domain tools + back button
    const handler = await getDomainHandler(state.currentDomain);
    return { tools: [...handler.getTools(), getBackTool()] };
  });

  // Route all tool calls through the decision tree
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    const sessionId = (extra as Record<string, unknown>)?.sessionId as string || 'default';
    const state = getState(sessionId);

    // --- Elicitation: collect token if missing (only for domain tools, not navigation) ---
    if (!isConfigured() && !NAVIGATION_TOOLS.includes(name)) {
      try {
        const elicitError = await elicitTokenIfMissing(server);
        if (elicitError) return elicitError;
      } catch {
        return {
          content: [{ type: 'text' as const, text: 'ROOTLY_API_TOKEN is required. Set it as an environment variable and restart.' }],
          isError: true,
        };
      }
    }

    // --- Navigation: rootly_navigate ---
    if (name === 'rootly_navigate') {
      const domain = args?.domain as DomainName;
      if (!['incidents', 'alerts', 'schedules', 'org'].includes(domain)) {
        return {
          content: [{ type: 'text' as const, text: `Unknown domain: ${domain}. Choose from: incidents, alerts, schedules, org` }],
          isError: true,
        };
      }

      state.currentDomain = domain;
      const handler = await getDomainHandler(domain);
      const toolNames = handler.getTools().map((t) => t.name).join(', ');

      // Notify client to refresh tool list
      await server.sendToolListChanged();

      return {
        content: [{
          type: 'text' as const,
          text: `Navigated to **${domain}** (${DOMAIN_DESCRIPTIONS[domain]}).\nAvailable tools: ${toolNames}`,
        }],
      };
    }

    // --- Navigation: rootly_back ---
    if (name === 'rootly_back') {
      state.currentDomain = null;
      await server.sendToolListChanged();
      return {
        content: [{ type: 'text' as const, text: 'Returned to Rootly domain navigation.' }],
      };
    }

    // --- Navigation: rootly_status ---
    if (name === 'rootly_status') {
      const configured = isConfigured();
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            connected: configured,
            ...(!configured && {
              hint: 'Call rootly_navigate or any tool to be prompted for your API token via elicitation.',
            }),
            domains: Object.entries(DOMAIN_DESCRIPTIONS).map(([name, desc]) => ({ name, description: desc })),
            currentDomain: state.currentDomain,
          }, null, 2),
        }],
      };
    }

    // --- Domain tools ---
    if (!state.currentDomain) {
      return {
        content: [{
          type: 'text' as const,
          text: `Unknown tool: ${name}. Use rootly_navigate to select a domain first.`,
        }],
        isError: true,
      };
    }

    const handler = await getDomainHandler(state.currentDomain);
    try {
      return await handler.handleCall(name, (args || {}) as Record<string, unknown>);
    } catch (error) {
      logger.error('Tool call failed', { tool: name, error: (error as Error).message });
      return {
        content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  });

  return server;
}
