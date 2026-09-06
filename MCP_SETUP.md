# ScriptSnap MCP Server Setup

Real MCP protocol server (uses `@modelcontextprotocol/sdk`) exposing one
tool so far: `generate_script`, wired to the personalization loop that's
ScriptSnap's actual differentiator — it pulls your top-performing keywords
and tone ratings (from scripts you've rated) into the prompt, and reports
back exactly which signals were used.

This replaces an earlier `mcp_server.ts` that was not a real MCP server —
it used the raw Anthropic SDK's tool-use format with no MCP transport, and
authenticated Edge Function calls with a literal placeholder string
(`"demo_jwt_token_" + userId`) that Supabase would reject.

## Files

- `server.json` — tool metadata (kept in sync with what's actually implemented)
- `mcp_server.ts` — the real MCP server (stdio transport)
- `package.json` / `tsconfig.json` — build config

## Auth

The server signs in with your real ScriptSnap account (email + password)
against Supabase's actual auth API, then forwards that session's access
token as a Bearer header to the Edge Functions — the same auth path the
web dashboard uses, not a placeholder.

```bash
export SCRIPTSNAP_EMAIL="you@example.com"
export SCRIPTSNAP_PASSWORD="your-scriptsnap-password"
```

If your account normally signs in via Google, it may not have a password
set — use "Forgot password" on the login page once to set one; email/
password sign-in is enabled on the account either way.

## Build & run locally

```bash
npm install
npm run build
npm start        # runs on stdio, waits for a client
```

## Using from Claude Code / Claude Desktop

```json
{
  "mcpServers": {
    "scriptsnap": {
      "command": "node",
      "args": ["/full/path/to/scriptsnap-backend/dist/mcp_server.js"],
      "env": {
        "SCRIPTSNAP_EMAIL": "you@example.com",
        "SCRIPTSNAP_PASSWORD": "your-scriptsnap-password"
      }
    }
  }
}
```

## Verified so far

- MCP handshake + tool schema: tested directly over stdio, works.
- `generate-script` Edge Function: deployed, compiles, personalization
  RPCs fixed (see repo history) and confirmed reachable with a real user
  token in the same session.
- End-to-end call through this MCP server with real ScriptSnap
  credentials: **not yet tested** — needs a real `SCRIPTSNAP_EMAIL`/
  `SCRIPTSNAP_PASSWORD` to try. Do that next.

## Not built yet (deliberately out of scope for this pass)

- `rate_script` as an MCP tool (the natural pairing — without it, ratings
  given via MCP can't feed the same learning loop; ratings still work fine
  through the web dashboard).
- HTTP transport for a shared/public connector (this is stdio-only,
  single-user, run locally per person). The old `snapscript` connector
  entry pointing at a Vercel URL doesn't correspond to anything here yet —
  that's a separate, bigger build (real OAuth so a hosted server can tell
  users apart, not just one person's stdio process).
