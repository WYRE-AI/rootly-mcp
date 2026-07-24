import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { rootlyGet } from '../client.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function getTools(): Tool[] {
  return [
    {
      name: 'rootly_schedules_list',
      description: 'List Rootly on-call schedules',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
          page: { type: 'number', description: 'Page number (default 1)' },
        },
      },
    },
    {
      name: 'rootly_schedules_get',
      description: 'Get a single Rootly on-call schedule by ID',
      inputSchema: {
        type: 'object',
        required: ['schedule_id'],
        properties: {
          schedule_id: { type: 'string', description: 'Schedule ID' },
        },
      },
    },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>, token?: string): Promise<CallToolResult> {
  try {
    switch (toolName) {
      case 'rootly_schedules_list': {
        const params: Record<string, string> = {};
        if (args.limit) params['page[size]'] = String(args.limit);
        if (args.page) params['page[number]'] = String(args.page);
        return ok(await rootlyGet('/on_call_schedules', params, token));
      }
      case 'rootly_schedules_get':
        return ok(await rootlyGet(`/on_call_schedules/${args.schedule_id}`, undefined, token));
      default:
        return err(`Unknown tool: ${toolName}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}

export const schedulesHandler: DomainHandler = { getTools, handleCall };
