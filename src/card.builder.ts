/**
 * Incident-card payload builder for the MCP Apps (SEP-1865) UI surface.
 *
 * rootly_incidents_get results get a normalized `_card` object attached
 * (see domains/incidents.ts) that the ui:// incident card renders from. The
 * card is progressive enhancement: every step here is best-effort, and a null
 * return simply means the host renders no card while the JSON payload is
 * unchanged. The card is read-only — rootly-mcp exposes no incident-note or
 * timeline-write tool, so no write action is offered.
 */

export const INCIDENT_CARD_RESOURCE_URI = 'ui://rootly/incident-card.html';

/** MCP Apps resource MIME (RESOURCE_MIME_TYPE in @modelcontextprotocol/ext-apps). */
export const MCP_APP_RESOURCE_MIME = 'text/html;profile=mcp-app';

/**
 * Tool `_meta` advertising the card. Carries both the canonical flat key
 * (RESOURCE_URI_META_KEY in ext-apps) and the nested form ext-apps'
 * registerAppTool emits, so any MCP Apps host revision finds it.
 */
export const INCIDENT_CARD_META = {
  'ui/resourceUri': INCIDENT_CARD_RESOURCE_URI,
  ui: { resourceUri: INCIDENT_CARD_RESOURCE_URI },
} as const;

/** Mirror of Brand in ui/incident-card.ts — keep in sync. */
export interface CardBrand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}

/** The BRAND_INJECT comment marker baked into the card HTML (see ui/index.html). */
const BRAND_INJECT_RE = /<!--\s*BRAND_INJECT:[\s\S]*?-->/;

/**
 * Serve-time brand injection: replace the BRAND_INJECT marker with an inline
 * `window.__BRAND__` script so self-hosters can theme the card without
 * rebuilding the bundle. An empty brand returns the HTML unchanged (the card
 * renders its neutral defaults). `<` is escaped so brand values can never
 * break out of the script tag.
 */
export function applyBrandInjection(html: string, brand: CardBrand): string {
  if (!brand || Object.values(brand).every((v) => !v)) return html;
  const json = JSON.stringify(brand).replace(/</g, '\\u003c');
  return html.replace(BRAND_INJECT_RE, `<script>window.__BRAND__=${json}</script>`);
}

/**
 * Resolve brand overrides from MCP_BRAND_* environment variables. Guarded for
 * runtimes without `process` (Cloudflare Workers), where this returns an empty
 * brand and the card serves its neutral defaults.
 */
export function resolveBrandFromEnv(): CardBrand {
  if (typeof process === 'undefined' || !process.env) return {};
  const env = process.env;
  const brand: CardBrand = {};
  if (env.MCP_BRAND_NAME) brand.name = env.MCP_BRAND_NAME;
  if (env.MCP_BRAND_LOGO_URL) brand.logoUrl = env.MCP_BRAND_LOGO_URL;
  if (env.MCP_BRAND_PRIMARY_COLOR) brand.primaryColor = env.MCP_BRAND_PRIMARY_COLOR;
  if (env.MCP_BRAND_ACCENT_COLOR) brand.accentColor = env.MCP_BRAND_ACCENT_COLOR;
  if (env.MCP_BRAND_BG) brand.bg = env.MCP_BRAND_BG;
  if (env.MCP_BRAND_TEXT) brand.text = env.MCP_BRAND_TEXT;
  return brand;
}

/** Mirror of IncidentCard in ui/incident-card.ts — keep in sync. */
export interface IncidentCard {
  id: string;
  sequentialId?: string;
  title: string;
  summary?: string;
  status?: string;
  severity?: string;
  kind?: string;
  services?: string[];
  environments?: string[];
  teams?: string[];
  startedBy?: string;
  createdAt?: string;
  startedAt?: string;
  mitigatedAt?: string;
  resolvedAt?: string;
}

const CARD_TEXT_MAX_LENGTH = 500;

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Resolve a display name from a Rootly JSON:API value. Rootly embeds related
 * records as nested documents (`{ data: { attributes: { name } } }`), but the
 * card is defensive about the exact nesting so a schema drift degrades to
 * "no label" rather than a broken card.
 */
function entityName(value: unknown): string | undefined {
  if (typeof value === 'string') return str(value);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const inner = (record.data ?? record) as Record<string, unknown>;
  const attrs = (inner?.attributes ?? inner) as Record<string, unknown>;
  if (!attrs || typeof attrs !== 'object') return undefined;
  return str(attrs.name) ?? str(attrs.full_name) ?? str(attrs.email);
}

function nameList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.map(entityName).filter((n): n is string => !!n);
  return names.length > 0 ? names : undefined;
}

/**
 * Build the renderable card from a rootly_incidents_get JSON:API document.
 * All labels (severity, services, environments, teams, creator) are resolved
 * from the nested records Rootly already embeds in the payload — no extra
 * API calls are made.
 */
export function buildIncidentCard(payload: unknown): IncidentCard | null {
  const data = (payload as { data?: unknown })?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const attrs = record.attributes as Record<string, unknown> | undefined;
  const id = str(record.id);
  const title = attrs && str(attrs.title);
  if (!id || !attrs || !title) return null;

  const card: IncidentCard = { id, title: title.slice(0, CARD_TEXT_MAX_LENGTH) };

  if (attrs.sequential_id != null) card.sequentialId = String(attrs.sequential_id);
  const summary = str(attrs.summary);
  if (summary) card.summary = summary.slice(0, CARD_TEXT_MAX_LENGTH);
  const status = str(attrs.status);
  if (status) card.status = status;
  const severity = entityName(attrs.severity);
  if (severity) card.severity = severity;
  const kind = str(attrs.kind);
  if (kind) card.kind = kind;

  const services = nameList(attrs.services);
  if (services) card.services = services;
  const environments = nameList(attrs.environments);
  if (environments) card.environments = environments;
  const teams = nameList(attrs.groups) ?? nameList(attrs.teams);
  if (teams) card.teams = teams;
  const startedBy = entityName(attrs.user);
  if (startedBy) card.startedBy = startedBy;

  const createdAt = str(attrs.created_at);
  if (createdAt) card.createdAt = createdAt;
  const startedAt = str(attrs.started_at);
  if (startedAt) card.startedAt = startedAt;
  const mitigatedAt = str(attrs.mitigated_at);
  if (mitigatedAt) card.mitigatedAt = mitigatedAt;
  const resolvedAt = str(attrs.resolved_at);
  if (resolvedAt) card.resolvedAt = resolvedAt;

  return card;
}

/**
 * Attach the normalized `_card` to a rootly_incidents_get payload.
 * Best-effort: any failure (or a payload that is not an incident) returns the
 * payload unchanged, so the tool result never degrades because of the card.
 */
export function withIncidentCard(payload: unknown): unknown {
  try {
    const card = buildIncidentCard(payload);
    if (card && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      return { ...(payload as Record<string, unknown>), _card: card };
    }
  } catch {
    // Card building must never break the tool result.
  }
  return payload;
}
