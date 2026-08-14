# ScriptSnap MCP Connector Setup

This MCP connector integrates ScriptSnap with Claude.ai, allowing users to generate YouTube Shorts scripts directly in their Claude conversations.

## What is MCP?

Model Context Protocol (MCP) is Anthropic's standard for connecting Claude to tools and services. Once registered, any Claude user can use your tools.

## Files in this Connector

- `server.json` - Tool definitions (what Claude sees)
- `mcp_server.ts` - Implementation (handles requests)
- `package.json` - Dependencies

## How It Works

1. User in Claude says: "Generate a script about Japanese pottery"
2. Claude calls → MCP Server → Supabase Edge Functions → Claude API → Returns script
3. User rates the script
4. AI learns from rating for next time

## Authentication Flow

Currently uses demo JWT tokens. For production:

1. Users authenticate via Supabase (email/password)
2. Get JWT token from `supabase.auth.getSession()`
3. MCP server passes token to Edge Functions
4. Edge Functions validate and execute
5. Results returned to user

## Registering with Claude

### Option 1: Claude.ai (Recommended)
1. Go to: https://claude.ai
2. Open Settings → Integrations
3. Click "Add Tool"
4. Choose "Upload MCP Server"
5. Select `server.json`
6. Claude configures automatically

### Option 2: Claude Desktop (Advanced)
1. Edit `~/.claude/config.json`
2. Add this entry:
```json
{
  "mcpServers": {
    "scriptsnap": {
      "command": "ts-node",
      "args": ["mcp_server.ts"]
    }
  }
}
```
3. Restart Claude Desktop

## Environment Variables

The MCP server uses:
- `SUPABASE_URL` - Your project URL (set in Supabase)
- `ANTHROPIC_API_KEY` - Claude API key (for agentic loop)
- `SUPABASE_SERVICE_ROLE_KEY` - For Edge Function auth

Already configured in Supabase secrets.

## Testing

```bash
npm install
npm start
```

Then in Claude:
```
Generate a script about sustainable fashion, 45 seconds, energetic tone
```

## Functions Available

### generate_script
Generates AI scripts with:
- Full script text
- SEO title
- Description
- 4 hashtags
- Pinned comment question
- 10 alternative titles (different styles)

**Input:**
```json
{
  "topic": "Japanese pottery",
  "duration": 30,
  "category": "Art & Design",
  "tone": "Meditative",
  "keywords": ["handmade", "clay"],
  "is_series": false
}
```

### rate_script
Rate a script to train the AI learning engine.

**Input:**
```json
{
  "script_id": "abc123",
  "rating": 5,
  "notes": "Perfect for our audience"
}
```

## Next Steps

1. ✅ Backend deployed (Edge Functions)
2. ✅ MCP server created
3. → **Register with Claude.ai** (coming next)
4. → **Build Next.js dashboard** (optional)
5. → **Add Stripe payments** (monetization)

## Support

Issues? Check:
- Supabase Edge Functions logs
- GitHub Actions deployment logs
- Claude MCP documentation
