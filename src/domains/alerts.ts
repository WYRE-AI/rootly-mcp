import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { rootlyGet, rootlyPost, rootlyPatch } from '../client.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function getTools(): Tool[] {
  return [
    {
      name: 'rootly_alerts_list',
      description: 'List Rootly alerts with optional status filter',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter: triggered, acknowledged, resolved' },
          limit: { type: 'number', description: 'Max results per page (default 25)' },
          page: { type: 'number', description: 'Page number (default 1)' },
        },
      },
    },
    {
      name: 'rootly_alerts_acknowledge',
      description: 'Acknowledge a Rootly alert',
      inputSchema: {
        type: 'object',
        required: ['alert_id'],
        properties: {
          alert_id: { type: 'string', description: 'Rootly alert ID' },
        },
      },
    },
    {
      name: 'rootly_alerts_resolve',
      description: 'Resolve a Rootly alert',
      inputSchema: {
        type: 'object',
        required: ['alert_id'],
        properties: {
          alert_id: { type: 'string', description: 'Rootly alert ID' },
        },
      },
    },
    {
      name: 'rootly_alerts_create',
      description: 'Create a new Rootly alert',
      inputSchema: {
        type: 'object',
        required: ['summary'],
        properties: {
          summary: { type: 'string', description: 'Alert summary' },
          source: { type: 'string', description: 'Alert source' },
          severity: { type: 'string', description: 'critical, warning, or info' },
        },
      },
    },
    {
      name: 'rootly_alerts_update',
      description: 'Update an existing Rootly alert',
      inputSchema: {
        type: 'object',
        required: ['alert_id'],
        properties: {
          alert_id: { type: 'string' },
          status: { type: 'string', description: 'triggered, acknowledged, or resolved' },
          summary: { type: 'string' },
        },
      },
    },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>, token?: string): Promise<CallToolResult> {
  try {
    switch (toolName) {
      case 'rootly_alerts_list': {
        const params: Record<string, string> = {};
        if (args.status) params['filter[status]'] = String(args.status);
        if (args.limit) params['page[size]'] = String(args.limit);
        if (args.page) params['page[number]'] = String(args.page);
        return ok(await rootlyGet('/alerts', params, token));
      }

      case 'rootly_alerts_acknowledge':
        return ok(await rootlyPatch(`/alerts/${args.alert_id}`, {
          data: { type: 'alerts', id: String(args.alert_id), attributes: { status: 'acknowledged' } },
        }, token));

      case 'rootly_alerts_resolve':
        return ok(await rootlyPatch(`/alerts/${args.alert_id}`, {
          data: { type: 'alerts', id: String(args.alert_id), attributes: { status: 'resolved' } },
        }, token));

      case 'rootly_alerts_create': {
        const attrs: Record<string, unknown> = { summary: args.summary };
        if (args.source) attrs.source = args.source;
        if (args.severity) attrs.severity = args.severity;
        return ok(await rootlyPost('/alerts', { data: { type: 'alerts', attributes: attrs } }, token));
      }

      case 'rootly_alerts_update': {
        const attrs: Record<string, unknown> = {};
        if (args.status) attrs.status = args.status;
        if (args.summary) attrs.summary = args.summary;
        return ok(await rootlyPatch(`/alerts/${args.alert_id}`, {
          data: { type: 'alerts', id: String(args.alert_id), attributes: attrs },
        }, token));
      }

      default:
        return err(`Unknown tool: ${toolName}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}

export const alertsHandler: DomainHandler = { getTools, handleCall };
