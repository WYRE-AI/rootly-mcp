/**
 * MCP Apps (SEP-1865) contract tests — mirrors the checks an MCP Apps host
 * performs to render the incident card:
 *   1. the renderable tool advertises the UI resource via _meta (both forms)
 *   2. the ui:// resource lists and reads back as profile=mcp-app HTML
 *   3. buildIncidentCard normalizes a Rootly JSON:API incident into the flat
 *      card payload the iframe renders from, best-effort
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getDomainHandler } from '../../src/domains/index.js';
import { getNavigationTools, getBackTool } from '../../src/domains/navigation.js';
import { incidentsHandler } from '../../src/domains/incidents.js';
import { listResources, readResource } from '../../src/resources.js';
import {
  buildIncidentCard,
  withIncidentCard,
  applyBrandInjection,
  INCIDENT_CARD_RESOURCE_URI,
  MCP_APP_RESOURCE_MIME,
} from '../../src/card.builder.js';
import { INCIDENT_CARD_HTML } from '../../src/generated/incident-card-html.js';
import type { DomainName } from '../../src/utils/types.js';

const RENDERABLE_TOOLS = ['rootly_incidents_get'];
const DOMAINS: DomainName[] = ['incidents', 'alerts', 'schedules', 'org'];

async function getAllTools(): Promise<Tool[]> {
  const tools: Tool[] = [...getNavigationTools(), getBackTool()];
  for (const domain of DOMAINS) {
    const handler = await getDomainHandler(domain);
    tools.push(...handler.getTools());
  }
  return tools;
}

const richIncident = {
  data: {
    id: 'inc-42',
    type: 'incidents',
    attributes: {
      title: 'Production database down',
      sequential_id: 137,
      summary: 'Primary Postgres is refusing connections',
      status: 'mitigated',
      kind: 'normal',
      severity: { data: { id: 'sev-1', type: 'severities', attributes: { name: 'SEV1', color: '#DC2626' } } },
      services: [{ data: { id: 'svc-1', type: 'services', attributes: { name: 'API' } } }],
      environments: [{ data: { id: 'env-1', type: 'environments', attributes: { name: 'Production' } } }],
      groups: [{ data: { id: 'team-1', type: 'groups', attributes: { name: 'Platform Engineering' } } }],
      user: { data: { id: 'user-1', type: 'users', attributes: { full_name: 'Dana Ruiz', email: 'dana@example.com' } } },
      created_at: '2026-07-17T09:00:00Z',
      started_at: '2026-07-17T09:05:00Z',
      mitigated_at: '2026-07-17T10:00:00Z',
    },
  },
};

describe('MCP Apps incident card', () => {
  describe('tool _meta advertisement', () => {
    it.each(RENDERABLE_TOOLS)('%s links the card via _meta', async (name) => {
      const tool = (await getAllTools()).find((t) => t.name === name);
      expect(tool).toBeDefined();
      // Canonical flat key (ext-apps RESOURCE_URI_META_KEY) …
      expect(tool?._meta?.['ui/resourceUri']).toBe(INCIDENT_CARD_RESOURCE_URI);
      // … and the nested form registerAppTool also emits.
      expect((tool?._meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
        INCIDENT_CARD_RESOURCE_URI
      );
    });

    it('no other tools carry UI metadata', async () => {
      const others = (await getAllTools()).filter(
        (t) => t._meta && !RENDERABLE_TOOLS.includes(t.name)
      );
      expect(others).toEqual([]);
    });
  });

  describe('ui:// resource', () => {
    it('is listed with the MCP Apps MIME type', () => {
      const card = listResources().find((r) => r.uri === INCIDENT_CARD_RESOURCE_URI);
      expect(card?.mimeType).toBe(MCP_APP_RESOURCE_MIME);
    });

    it('reads back as profile=mcp-app HTML containing the card app', () => {
      const content = readResource(INCIDENT_CARD_RESOURCE_URI);
      expect(content.mimeType).toBe(MCP_APP_RESOURCE_MIME);
      // No MCP_BRAND_* env set → the embedded HTML is served byte-identical.
      expect(content.text).toBe(INCIDENT_CARD_HTML);
      expect(content.text).toContain('card__bar');
      // The BRAND_INJECT marker must survive the vite build exactly once so
      // serve-time injection has an unambiguous replacement target.
      expect(content.text.match(/BRAND_INJECT/g)).toHaveLength(1);
      // The vite build must have inlined the bridge script — a bare <script src>
      // would be unloadable from a resources/read HTML string.
      expect(content.text).not.toContain('src="./incident-card.ts"');
    });

    it('serves neutral defaults with no vendor identity', () => {
      const { text } = readResource(INCIDENT_CARD_RESOURCE_URI);
      expect(text).not.toMatch(/WYRE/i);
      expect(text).not.toContain('00c9db'); // WYRE cyan
      expect(text).not.toContain('ede947'); // WYRE yellow
      expect(text).not.toContain('fonts.googleapis.com'); // no external fetches
    });

    it('injects MCP_BRAND_* env vars into the served HTML', () => {
      vi.stubEnv('MCP_BRAND_NAME', 'Acme MSP');
      vi.stubEnv('MCP_BRAND_PRIMARY_COLOR', '#ff0000');
      try {
        const { text } = readResource(INCIDENT_CARD_RESOURCE_URI);
        expect(text).toContain(
          '<script>window.__BRAND__={"name":"Acme MSP","primaryColor":"#ff0000"}</script>'
        );
        expect(text).not.toContain('BRAND_INJECT');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('rejects unknown resource URIs', () => {
      expect(() => readResource('ui://rootly/nope.html')).toThrow(/Unknown resource/);
    });
  });

  describe('applyBrandInjection', () => {
    const html = INCIDENT_CARD_HTML;

    it('replaces the marker with an inline window.__BRAND__ script', () => {
      const out = applyBrandInjection(html, { name: 'Acme', primaryColor: '#123456' });
      expect(out).toContain('window.__BRAND__={"name":"Acme","primaryColor":"#123456"}');
      expect(out).not.toContain('BRAND_INJECT');
    });

    it('escapes < so brand values cannot break out of the script tag', () => {
      const out = applyBrandInjection(html, { name: '</script><script>alert(1)' });
      expect(out).not.toContain('</script><script>alert(1)');
      expect(out).toContain('\\u003c/script>\\u003cscript>alert(1)');
    });

    it('returns the HTML unchanged for an empty brand', () => {
      expect(applyBrandInjection(html, {})).toBe(html);
      expect(applyBrandInjection(html, { name: '' })).toBe(html);
    });
  });

  describe('buildIncidentCard', () => {
    it('normalizes a JSON:API incident into flat, label-resolved strings', () => {
      expect(buildIncidentCard(richIncident)).toEqual({
        id: 'inc-42',
        sequentialId: '137',
        title: 'Production database down',
        summary: 'Primary Postgres is refusing connections',
        status: 'mitigated',
        kind: 'normal',
        severity: 'SEV1',
        services: ['API'],
        environments: ['Production'],
        teams: ['Platform Engineering'],
        startedBy: 'Dana Ruiz',
        createdAt: '2026-07-17T09:00:00Z',
        startedAt: '2026-07-17T09:05:00Z',
        mitigatedAt: '2026-07-17T10:00:00Z',
      });
    });

    it('builds a minimal card when optional attributes are absent', () => {
      const card = buildIncidentCard({
        data: { id: 'inc-1', type: 'incidents', attributes: { title: 'DB down', status: 'started' } },
      });
      expect(card).toEqual({ id: 'inc-1', title: 'DB down', status: 'started' });
    });

    it('truncates long text so the card payload stays small', () => {
      const card = buildIncidentCard({
        data: { id: 'inc-1', attributes: { title: 'x'.repeat(600), summary: 'y'.repeat(600) } },
      });
      expect(card?.title).toHaveLength(500);
      expect(card?.summary).toHaveLength(500);
    });

    it('degrades unresolvable relationship shapes instead of failing', () => {
      const card = buildIncidentCard({
        data: {
          id: 'inc-1',
          attributes: { title: 'DB down', severity: 42, services: [null, 7], user: 'not-a-doc' },
        },
      });
      expect(card).toEqual({ id: 'inc-1', title: 'DB down', startedBy: 'not-a-doc' });
    });

    it('returns null for payloads that are not an incident', () => {
      expect(buildIncidentCard(null)).toBeNull();
      expect(buildIncidentCard({})).toBeNull();
      expect(buildIncidentCard({ data: [] })).toBeNull();
      expect(buildIncidentCard({ data: { id: 'inc-1' } })).toBeNull();
      expect(buildIncidentCard({ data: { attributes: { title: 'no id' } } })).toBeNull();
    });
  });

  describe('withIncidentCard', () => {
    it('attaches _card and leaves the payload otherwise unchanged', () => {
      const out = withIncidentCard(richIncident) as Record<string, unknown>;
      expect(out.data).toBe(richIncident.data);
      expect((out._card as { id: string }).id).toBe('inc-42');
    });

    it('returns non-incident payloads unchanged (best-effort)', () => {
      const payload = { errors: [{ title: 'Not found' }] };
      expect(withIncidentCard(payload)).toBe(payload);
      expect(withIncidentCard(null)).toBeNull();
    });
  });

  describe('rootly_incidents_get handler', () => {
    beforeEach(() => {
      process.env.ROOTLY_API_TOKEN = 'test-token';
    });

    it('carries _card alongside the unchanged JSON:API payload', async () => {
      const result = await incidentsHandler.handleCall('rootly_incidents_get', { incident_id: 'inc-1' });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.data.id).toBe('inc-1');
      expect(parsed.data.attributes.title).toBe('Production database down');
      expect(parsed._card).toMatchObject({
        id: 'inc-1',
        title: 'Production database down',
        status: 'resolved',
      });
    });
  });
});
