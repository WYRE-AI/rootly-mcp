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

```bash
ROOTLY_API_TOKEN=your_token MCP_TRANSPORT=http node dist/http.js
# Listens on :8080 — /mcp for MCP, /health for health check
```

### 5. Run with Docker

```bash
docker compose up
# or
docker run -e ROOTLY_API_TOKEN=your_token ghcr.io/wyre-technology/rootly-mcp:latest
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

Download the `.mcpb` bundle from [Releases](https://github.com/wyre-technology/rootly-mcp/releases) and install it in Claude Desktop.

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
