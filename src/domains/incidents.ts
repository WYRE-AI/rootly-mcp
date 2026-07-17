import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { rootlyGet, rootlyPost, rootlyPatch } from '../client.js';
import { INCIDENT_CARD_META, withIncidentCard } from '../card.builder.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function getTools(): Tool[] {
  return [
    {
      name: 'rootly_incidents_list',
      description: 'List Rootly incidents with optional status/severity filters',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', description: 'Filter by status: started, mitigated, resolved' },
          severity: { type: 'string', description: 'Filter by severity slug (e.g. sev1)' },
          limit: { type: 'number', description: 'Max results per page (default 25)' },
          page: { type: 'number', description: 'Page number (default 1)' },
        },
      },
    },
    {
      name: 'rootly_incidents_get',
      description: 'Get a single Rootly incident by ID',
      _meta: INCIDENT_CARD_META,
      inputSchema: {
        type: 'object',
        required: ['incident_id'],
        properties: {
          incident_id: { type: 'string', description: 'Rootly incident ID' },
        },
      },
    },
    {
      name: 'rootly_incidents_create',
      description: 'Create a new Rootly incident',
      inputSchema: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', description: 'Incident title' },
          summary: { type: 'string', description: 'Short summary' },
          severity_id: { type: 'string', description: 'Severity ID to assign' },
          team_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Team IDs to assign',
          },
        },
      },
    },
    {
      name: 'rootly_incidents_update',
      description: 'Update an existing Rootly incident (title, summary, status, severity)',
      inputSchema: {
        type: 'object',
        required: ['incident_id'],
        properties: {
          incident_id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          status: { type: 'string', description: 'started | mitigated | resolved' },
          severity_id: { type: 'string' },
        },
      },
    },
    {
      name: 'rootly_incidents_resolve',
      description: 'Mark a Rootly incident as resolved',
      inputSchema: {
        type: 'object',
        required: ['incident_id'],
        properties: {
          incident_id: { type: 'string', description: 'Rootly incident ID' },
        },
      },
    },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    switch (toolName) {
      case 'rootly_incidents_list': {
        const params: Record<string, string> = {};
        if (args.status) params['filter[status]'] = String(args.status);
        if (args.severity) params['filter[severity_slug]'] = String(args.severity);
        if (args.limit) params['page[size]'] = String(args.limit);
        if (args.page) params['page[number]'] = String(args.page);
        return ok(await rootlyGet('/incidents', params));
      }
      case 'rootly_incidents_get':
        // withIncidentCard attaches a normalized _card for MCP Apps hosts;
        // it is best-effort and never alters the rest of the payload.
        return ok(withIncidentCard(await rootlyGet(`/incidents/${args.incident_id}`)));

      case 'rootly_incidents_create': {
        const attrs: Record<string, unknown> = { title: args.title };
        if (args.summary) attrs.summary = args.summary;
        if (args.severity_id) attrs.severity_id = args.severity_id;
        const payload: Record<string, unknown> = { data: { type: 'incidents', attributes: attrs } };
        if (args.team_ids && Array.isArray(args.team_ids)) {
          (payload.data as Record<string, unknown>).relationships = {
            teams: { data: (args.team_ids as string[]).map((id) => ({ type: 'teams', id })) },
          };
        }
        return ok(await rootlyPost('/incidents', payload));
      }

      case 'rootly_incidents_update': {
        const attrs: Record<string, unknown> = {};
        if (args.title) attrs.title = args.title;
        if (args.summary) attrs.summary = args.summary;
        if (args.status) attrs.status = args.status;
        if (args.severity_id) attrs.severity_id = args.severity_id;
        return ok(await rootlyPatch(`/incidents/${args.incident_id}`, {
          data: { type: 'incidents', id: String(args.incident_id), attributes: attrs },
        }));
      }

      case 'rootly_incidents_resolve':
        return ok(await rootlyPatch(`/incidents/${args.incident_id}`, {
          data: { type: 'incidents', id: String(args.incident_id), attributes: { status: 'resolved' } },
        }));

      default:
        return err(`Unknown tool: ${toolName}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}

export const incidentsHandler: DomainHandler = { getTools, handleCall };
