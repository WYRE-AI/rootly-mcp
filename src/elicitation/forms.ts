import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { CallToolResult } from '../utils/types.js';

type ElicitSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

/**
 * Request structured input from the user via a form.
 * Returns the user's response object, or null if they declined/cancelled.
 *
 * FALLBACK: If the client doesn't support elicitation (ElicitResult action
 * is neither 'accept' nor 'decline'), we treat it as declined.
 */
export async function elicitForm(
  server: Server,
  message: string,
  schema: ElicitSchema
): Promise<Record<string, unknown> | null> {
  const result = await server.elicitInput({ message, requestedSchema: schema as any });
  if (result.action === 'accept' && result.content) {
    return result.content as Record<string, unknown>;
  }
  return null;
}

/**
 * Elicit the Rootly API token if it isn't set.
 * Returns a CallToolResult error if the user declines, or null if token is now set.
 */
export async function elicitTokenIfMissing(server: Server): Promise<CallToolResult | null> {
  if (process.env.ROOTLY_API_TOKEN) return null;

  const result = await elicitForm(
    server,
    'Rootly API token is required. Provide your token from Rootly → Profile → API Tokens.',
    {
      type: 'object',
      required: ['api_token'],
      properties: {
        api_token: {
          type: 'string',
          title: 'Rootly API Token',
          description: 'Your Rootly API token (starts with rootly_...)',
        },
      },
    }
  );

  if (!result?.api_token) {
    return {
      content: [{ type: 'text', text: 'Rootly API token is required. Set ROOTLY_API_TOKEN and restart.' }],
      isError: true,
    };
  }

  // Inject for this session
  process.env.ROOTLY_API_TOKEN = String(result.api_token);
  return null;
}
