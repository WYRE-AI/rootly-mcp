## [Unreleased]

### Added
- **Interactive incident card via MCP Apps (SEP-1865).** `rootly_incidents_get` results now render as an interactive card in MCP Apps hosts (Claude Desktop/web, and other hosts advertising the `io.modelcontextprotocol/ui` extension), instead of a wall of JSON:API. The card shows status, severity, kind, services, environments, teams, and the reporter as human-readable labels plus a created/started/mitigated/resolved timeline. Non-App hosts are unaffected: the tool's JSON payload is unchanged apart from a new `_card` field. The card is read-only — rootly-mcp has no incident-note/timeline-write tool, so no write action is offered.
  - The renderable tool advertises the UI via `_meta` (`ui/resourceUri`, plus the nested `ui.resourceUri` form) pointing at a new `ui://rootly/incident-card.html` resource served as `text/html;profile=mcp-app`. The card HTML is a self-contained vite single-file bundle embedded at build time (`src/generated/incident-card-html.ts`, committed), so it serves identically from stdio, Node HTTP, and the fs-less Cloudflare Workers runtime. The server now declares the `resources` capability and answers `resources/list` / `resources/read` (`src/resources.ts`).
  - The card is neutral by default (system fonts, no vendor identity, no external fetches) and brandable via `window.__BRAND__` injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`, `MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`, `MCP_BRAND_TEXT`): at serve time the server replaces the card's BRAND_INJECT marker with an inline, `<`-escaped `window.__BRAND__` script, so self-hosters can theme the card without rebuilding. No brand configured = HTML served unchanged.
  - The card payload builder is best-effort: an unresolvable payload degrades the card (or drops it) without affecting the tool result. 19 new contract tests in `tests/unit/mcp-apps.test.ts` pin the `_meta` advertisement, the `ui://` resource wire shape, the neutral-default/brand-injection behavior, and the card normalization.

### Fixed
- **health/liveness:** `/health` on the HTTP (Node) transport now always returns `200` instead of gating on `ROOTLY_API_TOKEN` via `isConfigured()`. Credentials are supplied per-request through the gateway, so the environment carries no token — the previous `503` caused the Azure Container Apps liveness probe to crash-loop the container. The `credentials.configured` flag is retained in the response body as a diagnostic only. (`worker.ts` health was already static `200`.)

## [1.0.6](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.5...v1.0.6) (2026-04-07)


### Bug Fixes

* **ci:** drop prepare hook so mcpb job's omit=dev install doesn't re-run tsup post-prune ([bf5f1a8](https://github.com/wyre-technology/rootly-mcp/commit/bf5f1a8552fb61d49d9fb4fc645ffbc86eef47b5))

## [1.0.5](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.4...v1.0.5) (2026-04-07)


### Bug Fixes

* **docker:** move 'npm prune --omit=dev' to builder stage to preserve GHCR auth ([731bff3](https://github.com/wyre-technology/rootly-mcp/commit/731bff326e645115845d4655f25f099b94fac175))

## [1.0.4](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.3...v1.0.4) (2026-04-07)


### Bug Fixes

* **ci:** deploy :latest tag, force revision via env var bump ([3523054](https://github.com/wyre-technology/rootly-mcp/commit/35230548c85f5bbdf911ecfac2af6081e4f5a5b9))

## [1.0.3](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.2...v1.0.3) (2026-04-06)


### Bug Fixes

* per-request MCP Server+Transport for gateway compatibility ([4372cf9](https://github.com/wyre-technology/rootly-mcp/commit/4372cf9f177e8a298ed5fc73d609b785424c794e))

## [1.0.2](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.1...v1.0.2) (2026-04-06)


### Bug Fixes

* **ci:** fix node -p shell quoting in release workflow ([b215ced](https://github.com/wyre-technology/rootly-mcp/commit/b215ced6f1f322d5cb9b4c9d49eda183a3aaf574))

## [1.0.1](https://github.com/wyre-technology/rootly-mcp/compare/v1.0.0...v1.0.1) (2026-04-06)


### Bug Fixes

* **ci:** add missing semantic-release plugin dependencies ([011fe5e](https://github.com/wyre-technology/rootly-mcp/commit/011fe5e899abdc747852a4b3abfd9dc842c471dd))
* **ci:** add NODE_AUTH_TOKEN for GitHub Packages auth in all jobs ([55d39b7](https://github.com/wyre-technology/rootly-mcp/commit/55d39b70e710bd24151d9d201376140fd95c8534))
* **ci:** Configure GitHub Packages auth for release workflow ([5c0224c](https://github.com/wyre-technology/rootly-mcp/commit/5c0224c330131f5c00f674606a9fb0c3ba3fb348))
* **deploy:** replace node_compat with nodejs_compat for Wrangler v4 ([e97b629](https://github.com/wyre-technology/rootly-mcp/commit/e97b62989bf808d37a3e05da45c6492f210b6f9d))

# Changelog

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [1.0.0] - 2026-03-22

### Added
- MCP server for the Rootly incident management platform
- Navigation tree with domain-based tool organization (incidents, alerts, schedules, org)
- Full team management — create, get, update, delete
- HTTP transport via StreamableHTTP with session management
- Cloudflare Worker support (experimental) with native fetch client
- Two-layer architecture depending on `@wyre-technology/node-rootly`
- Docker image published to GHCR

### Fixed
- GitHub Packages auth: set `NODE_AUTH_TOKEN` in CI for `npm ci` to resolve scoped package
- Externalize `@wyre-technology/node-rootly` in Node.js tsup build
- Worker build: exclude node-rootly via `esbuildOptions` to avoid bundling Node.js-only code
- HTTP transport: pass `{ isConfigured }` dependency to `createServer()`
- Restore complete `worker.ts` fetch handler (health check, routing, env injection)
