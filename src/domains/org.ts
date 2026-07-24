import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { DomainHandler, CallToolResult } from '../utils/types.js';
import { rootlyGet, rootlyPost, rootlyPut, rootlyDelete } from '../client.js';

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(msg: string): CallToolResult {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

function getTools(): Tool[] {
  return [
    // ── Teams (full CRUD) ──────────────────────────────────────────────
    {
      name: 'rootly_org_teams_list',
      description: 'List all Rootly teams',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 25)' },
          page: { type: 'number', description: 'Page number (default 1)' },
        },
      },
    },
    {
      name: 'rootly_org_teams_get',
      description: 'Get a single Rootly team by ID',
      inputSchema: {
        type: 'object',
        required: ['team_id'],
        properties: {
          team_id: { type: 'string', description: 'Team ID' },
        },
      },
    },
    {
      name: 'rootly_org_teams_create',
      description: 'Create a new Rootly team',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Team name' },
          description: { type: 'string', description: 'Team description' },
          color: { type: 'string', description: 'Hex color (e.g. #FF5733)' },
          notify_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Email addresses to notify for this team',
          },
          user_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'User IDs to add as team members',
          },
        },
      },
    },
    {
      name: 'rootly_org_teams_update',
      description: 'Update an existing Rootly team (uses PUT — full replacement of mutable fields)',
      inputSchema: {
        type: 'object',
        required: ['team_id'],
        properties: {
          team_id: { type: 'string', description: 'Team ID to update' },
          name: { type: 'string', description: 'New team name' },
          description: { type: 'string', description: 'New description' },
          color: { type: 'string', description: 'Hex color (e.g. #FF5733)' },
          notify_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Updated email notification list',
          },
          user_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Updated team member user IDs (replaces existing)',
          },
        },
      },
    },
    {
      name: 'rootly_org_teams_delete',
      description:
        '⚠ DESTRUCTIVE — IRREVERSIBLE. Permanently deletes a Rootly team and removes ' +
        'all associated configurations, memberships, and incident assignments. ' +
        'This action cannot be undone. Confirm with the user before invoking.',
      annotations: {
        title: 'Delete team (irreversible)',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
      inputSchema: {
        type: 'object',
        required: ['team_id'],
        properties: {
          team_id: { type: 'string', description: 'Team ID to delete' },
        },
      },
    },
    {
      name: 'rootly_org_teams_patch',
      description:
        'Safely update specific fields on a team without wiping others. ' +
        'Fetches the current team, merges your changes, then PUTs the result. ' +
        'Use this instead of rootly_org_teams_update when you only want to change one or two fields.',
      inputSchema: {
        type: 'object',
        required: ['team_id'],
        properties: {
          team_id: { type: 'string', description: 'Team ID to patch' },
          name: { type: 'string', description: 'New name (optional)' },
          description: { type: 'string', description: 'New description (optional)' },
          color: { type: 'string', description: 'New hex color e.g. #FF5733 (optional)' },
          notify_emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace notification email list (optional)',
          },
          user_ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replace team member IDs (optional — omit to keep current members)',
          },
        },
      },
    },

    // ── Severities ────────────────────────────────────────────────────
    {
      name: 'rootly_org_severities_list',
      description: 'List Rootly incident severity levels',
      inputSchema: { type: 'object', properties: {} },
    },

    // ── Current user ──────────────────────────────────────────────────
    {
      name: 'rootly_org_current_user',
      description: 'Get the current authenticated Rootly user (verifies token)',
      inputSchema: { type: 'object', properties: {} },
    },
  ];
}

async function handleCall(toolName: string, args: Record<string, unknown>, token?: string): Promise<CallToolResult> {
  try {
    switch (toolName) {
      // ── Teams ──────────────────────────────────────────────────────
      case 'rootly_org_teams_list': {
        const params: Record<string, string> = {};
        if (args.limit) params['page[size]'] = String(args.limit);
        if (args.page) params['page[number]'] = String(args.page);
        return ok(await rootlyGet('/teams', params, token));
      }

      case 'rootly_org_teams_get':
        return ok(await rootlyGet(`/teams/${args.team_id}`, undefined, token));

      case 'rootly_org_teams_create': {
        const attrs: Record<string, unknown> = { name: args.name };
        if (args.description) attrs.description = args.description;
        if (args.color) attrs.color = args.color;
        if (args.notify_emails) attrs.notify_emails = args.notify_emails;

        const payload: Record<string, unknown> = { data: { type: 'teams', attributes: attrs } };

        if (args.user_ids && Array.isArray(args.user_ids) && args.user_ids.length > 0) {
          (payload.data as Record<string, unknown>).relationships = {
            users: {
              data: (args.user_ids as string[]).map((id) => ({ type: 'users', id })),
            },
          };
        }

        return ok(await rootlyPost('/teams', payload, token));
      }

      case 'rootly_org_teams_update': {
        const attrs: Record<string, unknown> = {};
        if (args.name) attrs.name = args.name;
        if (args.description !== undefined) attrs.description = args.description;
        if (args.color) attrs.color = args.color;
        if (args.notify_emails) attrs.notify_emails = args.notify_emails;

        const payload: Record<string, unknown> = {
          data: {
            type: 'teams',
            id: String(args.team_id),
            attributes: attrs,
          },
        };

        if (args.user_ids && Array.isArray(args.user_ids)) {
          (payload.data as Record<string, unknown>).relationships = {
            users: {
              data: (args.user_ids as string[]).map((id) => ({ type: 'users', id })),
            },
          };
        }

        return ok(await rootlyPut(`/teams/${args.team_id}`, payload, token));
      }

      case 'rootly_org_teams_delete':
        await rootlyDelete(`/teams/${args.team_id}`, token);
        return ok({ deleted: true, team_id: args.team_id });

      case 'rootly_org_teams_patch': {
        // GET current state, merge changes, PUT back — safe partial update
        const current = await rootlyGet(`/teams/${args.team_id}`, undefined, token) as Record<string, unknown>;
        const currentAttrs = ((current?.data as Record<string, unknown>)?.attributes ?? {}) as Record<string, unknown>;

        const mergedAttrs: Record<string, unknown> = {
          ...currentAttrs,
          ...(args.name !== undefined && { name: args.name }),
          ...(args.description !== undefined && { description: args.description }),
          ...(args.color !== undefined && { color: args.color }),
          ...(args.notify_emails !== undefined && { notify_emails: args.notify_emails }),
        };

        const payload: Record<string, unknown> = {
          data: {
            type: 'teams',
            id: String(args.team_id),
            attributes: mergedAttrs,
          },
        };

        // Only update members if user_ids was explicitly passed
        if (args.user_ids !== undefined && Array.isArray(args.user_ids)) {
          (payload.data as Record<string, unknown>).relationships = {
            users: {
              data: (args.user_ids as string[]).map((id) => ({ type: 'users', id })),
            },
          };
        }

        return ok(await rootlyPut(`/teams/${args.team_id}`, payload, token));
      }

      // ── Severities ─────────────────────────────────────────────────
      case 'rootly_org_severities_list':
        return ok(await rootlyGet('/severities', undefined, token));

      // ── User ───────────────────────────────────────────────────────
      case 'rootly_org_current_user':
        return ok(await rootlyGet('/users/me', undefined, token));

      default:
        return err(`Unknown tool: ${toolName}`);
    }
  } catch (e) {
    return err((e as Error).message);
  }
}

export const orgHandler: DomainHandler = { getTools, handleCall };
