# rootly-mcp

MCP server for the [Rootly](https://rootly.com) incident management platform.

Built by WYRE Technology — part of the wyre-projects MCP server collection.

Uses **decision-tree navigation**: start with `rootly_navigate` to select a domain, then use that domain's tools. Call `rootly_back` to return.

## Domains & Tools

### Navigation (always available)
| Tool | Description |
|------|-------------|
| `rootly_navigate` | Navigate to a domain: `incidents`, `alerts`, `schedules`, `org` |
| `rootly_status` | Check connection status and available domains |
| `rootly_back` | Return to the navigation menu |

### Domain: incidents
| Tool | Description |
|------|-------------|
| `rootly_incidents_list` | List incidents with optional status/severity filters |
| `rootly_incidents_get` | Get a single incident by ID |
| `rootly_incidents_create` | Create a new incident |
| `rootly_incidents_update` | Update title, summary, status, or severity |
| `rootly_incidents_resolve` | Resolve an incident |

### Domain: alerts
| Tool | Description |
|------|-------------|
| `rootly_alerts_list` | List alerts with optional status filter |
| `rootly_alerts_acknowledge` | Acknowledge an alert |
| `rootly_alerts_resolve` | Resolve an alert |
| `rootly_alerts_create` | Create a new alert |
| `rootly_alerts_update` | Update alert status or summary |

### Domain: schedules
| Tool | Description |
|------|-------------|
| `rootly_schedules_list` | List on-call schedules |
| `rootly_schedules_get` | Get a single on-call schedule |

### Domain: org
| Tool | Description |
|------|-------------|
| `rootly_org_list_teams` | List teams |
| `rootly_org_list_severities` | List severity levels |
| `rootly_org_current_user` | Get current authenticated user |

## Interactive Incident Card (MCP Apps)

`rootly_incidents_get` renders as an interactive read-only card in MCP Apps
hosts (Claude Desktop/web) showing status, severity, services, environments,
teams, and a lifecycle timeline; plain-JSON behavior is unchanged in other
hosts. The card is neutral by default and brandable via `window.__BRAND__`
injection or `MCP_BRAND_*` env vars (`MCP_BRAND_NAME`, `MCP_BRAND_LOGO_URL`,
`MCP_BRAND_PRIMARY_COLOR`, `MCP_BRAND_ACCENT_COLOR`, `MCP_BRAND_BG`,
`MCP_BRAND_TEXT`) — no rebuild needed. Rebuild the card bundle itself with
`npm run build:ui` (only needed when `ui/` changes; the embedded output is
committed).

## Setup

### 1. Install & build

```bash
cd rootly-mcp
npm install
npm run build
```

### 2. Set your API token

```bash
export ROOTLY_API_TOKEN=rootly_xxxxxxxxxxxxxxxx
```

Get your token from **Rootly → Profile → API Tokens**.

### 3. Run (stdio — for mcporter/Claude Desktop)

```bash
ROOTLY_API_TOKEN=your_token node dist/index.js
```

### 4. Run (HTTP streaming transport)

`CONDUIT_S2S_SECRET` is required. If it is empty or a known placeholder (`changeme`, `change-me`, `secret`, `example`, `placeholder`, `replace-me`, `your-secret`, `your-s2s-secret`, `s2s-secret`, `replace-with-a-real-secret`), the HTTP server logs an error and exits non-zero. It never prints the secret.

```bash
# Refuses to start until CONDUIT_S2S_SECRET is set. With a secret and no
# MCP_HTTP_HOST, the process binds 0.0.0.0 (same as container deploys).
CONDUIT_S2S_SECRET="$CONDUIT_S2S_SECRET" \
  ROOTLY_API_TOKEN=your_token \
  MCP_HTTP_HOST=127.0.0.1 \
  npm run start:http

# Local HTTP only, without a service-to-service secret. Always binds 127.0.0.1.
# A non-loopback MCP_HTTP_HOST is overridden and that override is logged.
MCP_ALLOW_INSECURE_DEV=1 npm run start:http
```

`/health` stays unauthenticated, does not require `X-Gateway-S2S`, and does not return the API token. The stdio transport does not use `CONDUIT_S2S_SECRET`.

### 5. Run with Docker

The image listens on `0.0.0.0` inside the container (`MCP_HTTP_HOST`) and defaults to `AUTH_MODE=gateway`. Publish the port on loopback and pass the S2S secret. In gateway mode the Rootly token arrives on each request as `X-Rootly-Api-Token`; it is not read from the environment.

```bash
docker build -t rootly-mcp .
docker run \
  -e CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" \
  -p 127.0.0.1:8080:8080 \
  rootly-mcp
```

Do not pass a known placeholder such as `your-s2s-secret` or `changeme`. Startup treats those as unset and exits. Compose refuses to start when `CONDUIT_S2S_SECRET` is unset, sets `AUTH_MODE=gateway`, does not pass `ROOTLY_API_TOKEN`, and publishes `127.0.0.1:8080:8080`. A project `.env` is interpolation only — do not add `env_file` to the gateway service.

```bash
CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" docker compose up
```

Single-tenant HTTP (`AUTH_MODE=env`) still requires the S2S secret, then uses `ROOTLY_API_TOKEN`:

```bash
docker run \
  -e CONDUIT_S2S_SECRET="$(openssl rand -hex 32)" \
  -e AUTH_MODE=env \
  -e ROOTLY_API_TOKEN=your_token \
  -e MCP_HTTP_HOST=0.0.0.0 \
  -p 127.0.0.1:8080:8080 \
  rootly-mcp
```

## Configuration

Copy [`.env.example`](.env.example) and set the variables below.

| Variable | Required | Description |
|----------|----------|-------------|
| `ROOTLY_API_TOKEN` | For stdio and `AUTH_MODE=env` | Rootly API token (Bearer). Gateway mode does not read this. |
| `MCP_TRANSPORT` | No | `stdio` (default) or `http` |
| `AUTH_MODE` | No | `gateway` (Docker image and Compose default) or `env`. Gateway mode requires `X-Rootly-Api-Token` on each `/mcp` request and never falls back to `ROOTLY_API_TOKEN`. `env` uses that variable after S2S auth succeeds. |
| `CONDUIT_S2S_SECRET` | Yes for HTTP | Service-to-service secret. The HTTP server logs an error and exits non-zero when this is empty or a known placeholder. Compose will not start without it. Never commit a real value. |
| `MCP_ALLOW_INSECURE_DEV` | No | Set to exactly `1` only for local development to start HTTP without `CONDUIT_S2S_SECRET`. The process logs a warning, does not enforce `X-Gateway-S2S`, and binds `127.0.0.1` only. A non-loopback `MCP_HTTP_HOST` is overridden and logged. A placeholder secret still refuses to start. |
| `MCP_HTTP_HOST` | No | Bind address when a secret is configured. Unset means `0.0.0.0`. The container image sets `0.0.0.0`. Ignored in favor of `127.0.0.1` when the insecure-dev bypass is on. |
| `MCP_HTTP_PORT` | No | HTTP port. Defaults to `8080`. |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error`. Defaults to `info`. |

### HTTP authentication

With `MCP_TRANSPORT=http` and `CONDUIT_S2S_SECRET` set, every `/mcp` request must include `X-Gateway-S2S`. The value is `t=<unix seconds>,v1=<hex hmac-sha256>`. The hex digest is HMAC-SHA256 over the exact ASCII string `t=<unix seconds>` (the same prefix that appears in the header), keyed with `CONDUIT_S2S_SECRET`, encoded as 64 lowercase hex characters. The timestamp must be within 300 seconds of the server clock. A missing or invalid header returns 401. The secret is never written to logs or the response.

```
X-Gateway-S2S: t=1710000000,v1=<64 lowercase hex chars>
```

In `AUTH_MODE=gateway`, `/mcp` also requires `X-Rootly-Api-Token`. That header is the only Rootly credential for the request. A request without it returns 401 and does not fall back to `ROOTLY_API_TOKEN`.

```bash
curl -sS http://127.0.0.1:8080/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H "x-gateway-s2s: $X_GATEWAY_S2S" \
  -H "x-rootly-api-token: $ROOTLY_API_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"rootly_status","arguments":{}}}'
```

## mcporter Configuration

```json
{
  "rootly": {
    "command": "node",
    "args": ["/path/to/rootly-mcp/dist/index.js"],
    "env": {
      "ROOTLY_API_TOKEN": "rootly_xxxxxxxxxxxxxxxx"
    }
  }
}
```

Then: `mcporter call rootly.rootly_navigate --domain alerts`

## Claude Desktop (MCPB)

Download the `.mcpb` bundle from [Releases](https://github.com/WYRE-AI/rootly-mcp/releases) and install it in Claude Desktop.

Or manually add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rootly": {
      "command": "node",
      "args": ["/path/to/rootly-mcp/dist/index.js"],
      "env": { "ROOTLY_API_TOKEN": "your_token" }
    }
  }
}
```

## Rate Limiting

Rootly enforces **3 write operations per 60 seconds**. The server tracks this in-process and returns a descriptive error with retry-after time if exceeded.

## API Reference

- Rootly API docs: <https://docs.rootly.com/api-reference>
- API base URL: `https://api.rootly.com/v1`
- Auth: `Authorization: Bearer <token>`
- Write content-type: `application/vnd.api+json`

## Development

```bash
npm run dev        # watch mode
npm run lint       # TypeScript type-check
npm run test       # run tests
```

## License

Apache-2.0 © WYRE Technology
