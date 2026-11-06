# N&N Digitals Social MCP

Hosted MCP service for the Social MCP Chrome extension.

## Production architecture

- Website: `https://nndigitals.com` (existing GitHub Pages site remains unchanged)
- API/MCP: `https://api.nndigitals.com/mcp`
- Health: `https://api.nndigitals.com/health`
- Extension bridge: `wss://api.nndigitals.com/bridge`

The MCP service is deployed separately from GitHub Pages because Pages only hosts static files. The Render blueprint is at `render.yaml`.

## Deploy

1. Create a Render Web Service from this repository and use the included `render.yaml` blueprint (or configure the service with root directory `social-mcp/server`, build `npm install`, start `npm start`).
2. Generate two independent long random secrets in Render: `SOCIAL_MCP_TOKEN` and `SOCIAL_BRIDGE_TOKEN`. Do not commit either value.
3. Add `api.nndigitals.com` as the Render custom domain and configure the DNS CNAME record exactly as Render instructs. Keep the existing apex/www website DNS records unchanged.
4. After TLS is active, open `https://api.nndigitals.com/health`.
5. Load the `social-mcp/extension` folder in Chrome, enter the MCP URL, MCP token and bridge token, then save.
6. Add the MCP server to the AI client using the URL `https://api.nndigitals.com/mcp` and bearer token `SOCIAL_MCP_TOKEN`.

## Supported platforms

LinkedIn, Facebook and Instagram. The extension uses the user's existing browser session; it does not collect passwords or read cookie values.

## Safety

Publishing is review-first. `submit=true` is ignored unless the user separately enables **Allow AI to submit posts** in the extension. Use only accounts you own or are authorized to manage. UI selectors can change as social platforms update their websites; test each platform with a draft before relying on it.

## Important current limitation

This first hosted deployment is a single connected-browser bridge intended for the product owner/test environment. It allows one active extension connection at a time. A production multi-customer SaaS release needs per-user pairing, isolated browser sessions, tenant-scoped tokens, rate limits and audit logs before public onboarding.
