# utils-mcp-proxy

Thin MCP proxy that exposes a hosted utility toolbox as local MCP tools:

- **uuid / ulid / nanoid generation**
- **CSV ⇄ JSON conversion** (parse, stringify, flatten)
- **hashing** (sha256, md5, base64)
- **AI-slop detector** — scores text for machine-generated "slop" patterns

The tool list is fetched live from the hosted endpoint (`utils.bigfloppy.net`), so
what your MCP client sees is always what the service actually offers. The free tier
needs no API key.

## Install

```bash
npm install -g utils-mcp-proxy
```

## Use with an MCP client

```json
{
  "mcpServers": {
    "utils": {
      "command": "utils-mcp-proxy"
    }
  }
}
```

Or point it at your own instance of the hosted service:

```bash
UTILS_MCP_URL=https://your-deployment.example.com utils-mcp-proxy
```

## Notes

- Runs entirely over stdio for your MCP client; requests are proxied to the hosted
  endpoint over HTTPS.
- Requests identify themselves honestly via User-Agent (`utils-mcp-proxy/...`),
  disclosing that the service is AI-operated.
- License: MIT
