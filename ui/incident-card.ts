/**
 * Iframe bridge + renderer for the Rootly incident card (MCP Apps, SEP-1865).
 *
 * Runs inside the host's sandboxed iframe. Uses the official MCP Apps client
 * (`App`) to receive the tool result from the host. The card is read-only:
 * rootly-mcp has no incident-note/timeline-write tool, so no round-trip
 * action is offered.
 *
 * The server attaches a normalized `_card` payload to rootly_incidents_get
 * results (see src/card.builder.ts) so this renderer never needs to resolve
 * JSON:API relationships or ids itself.
 *
 * Rendering uses DOM construction (no innerHTML) — incident titles and
 * summaries are untrusted vendor data, so text only ever lands in text nodes.
 *
 * White-label: the card is neutral by default (no vendor identity) and applies
 * an injected `window.__BRAND__` override (set by the MCP server via
 * MCP_BRAND_* env vars, or a gateway per-org) so the same card can render in
 * any operator's brand.
 */
import { App } from '@modelcontextprotocol/ext-apps';

interface Brand {
  name?: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  bg?: string;
  text?: string;
}
declare global {
  interface Window {
    __BRAND__?: Brand;
  }
}

/** Mirror of IncidentCard in src/card.builder.ts — keep in sync. */
interface IncidentCard {
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

const brand: Brand = window.__BRAND__ ?? {};
const brandName = brand.name ?? '';

// Apply any injected brand overrides onto the CSS custom properties.
function applyBrand(): void {
  const root = document.documentElement.style;
  if (brand.primaryColor) root.setProperty('--brand-primary', brand.primaryColor);
  if (brand.accentColor) root.setProperty('--brand-accent', brand.accentColor);
  if (brand.bg) root.setProperty('--brand-bg', brand.bg);
  if (brand.text) root.setProperty('--brand-text', brand.text);
}

const app = new App({ name: 'Rootly Incident Card', version: '1.0.0' });

/** Create an element with a class and (safe, text-node) children. */
function el(
  tag: string,
  className = '',
  ...children: Array<Node | string | null>
): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) {
    if (child == null) continue;
    node.append(child); // strings become text nodes — never parsed as HTML
  }
  return node;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function field(label: string, value: string | undefined): HTMLElement | null {
  if (!value) return null;
  return el('div', 'field', el('div', 'field__label', label), el('div', 'field__value', value));
}

function badge(text: string | undefined, cls: string): HTMLElement | null {
  return text ? el('span', `badge ${cls}`, text) : null;
}

function timelineEvent(label: string, iso: string | undefined): HTMLElement | null {
  if (!iso) return null;
  return el('div', 'event', el('span', 'event__label', label), el('span', 'event__when', fmtDate(iso)));
}

function render(incident: IncidentCard): void {
  // Brand identity only renders when a brand was injected — the neutral
  // default shows just the incident number/vendor context in the header.
  let brandId: HTMLElement | null = null;
  if (brandName || brand.logoUrl) {
    brandId = el('span', 'brandid');
    if (brand.logoUrl) {
      const logo = document.createElement('img');
      logo.src = brand.logoUrl;
      logo.alt = brandName;
      logo.style.display = 'inline-block';
      brandId.append(logo);
    }
    if (brandName) brandId.append(el('span', 'brand', brandName));
  }

  const events = [
    timelineEvent('Created', incident.createdAt),
    timelineEvent('Started', incident.startedAt),
    timelineEvent('Mitigated', incident.mitigatedAt),
    timelineEvent('Resolved', incident.resolvedAt),
  ].filter((e): e is HTMLElement => e !== null);

  let timeline: HTMLElement | null = null;
  if (events.length > 0) {
    timeline = el('div', 'timeline', el('div', 'timeline__h', 'Timeline'));
    for (const e of events) timeline.append(e);
  }

  const refNo = incident.sequentialId ? `#${incident.sequentialId}` : incident.id;
  const body = el(
    'div',
    'card__body',
    el('div', 'brandrow', brandId, el('span', 'incidentno', `${refNo} · Rootly`)),
    el('h1', '', incident.title),
    el(
      'div',
      'badges',
      badge(incident.status, 'badge--status'),
      badge(incident.severity, 'badge--sev'),
      badge(incident.kind, ''),
    ),
    incident.summary ? el('p', 'summary', incident.summary) : null,
    el(
      'div',
      'grid',
      field('Services', incident.services?.join(', ')),
      field('Environments', incident.environments?.join(', ')),
      field('Teams', incident.teams?.join(', ')),
      field('Started by', incident.startedBy),
    ),
    timeline,
  );

  const root = document.getElementById('root')!;
  root.replaceChildren(el('div', 'card', el('div', 'card__bar'), body));
}

// rootly-mcp returns the JSON:API incident document directly and attaches the
// normalized card to rootly_incidents_get results as _card.
function extractCard(obj: unknown): IncidentCard | null {
  const card = (obj as { _card?: IncidentCard })?._card;
  return card && typeof card.id === 'string' && typeof card.title === 'string' ? card : null;
}

applyBrand();

// Must be set before connect() so the initial tool-result isn't missed.
app.ontoolresult = (result: { content?: Array<{ type: string; text?: string }> }) => {
  const payload = (result.content ?? []).find((c) => c.type === 'text');
  if (!payload?.text) return;
  try {
    const card = extractCard(JSON.parse(payload.text));
    if (card) render(card);
  } catch {
    /* ignore malformed payloads */
  }
};

app.connect();
