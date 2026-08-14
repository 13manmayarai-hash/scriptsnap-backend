# ScriptSnap Backend

Serverless Edge Functions for ScriptSnap SaaS using Supabase.

## Functions

- **generate-script** - Generate AI scripts with learning feedback
- **rate-script** - Rate scripts, trigger learning engine  
- **get-library** - Get user's scripts with AI insights
- **delete-script** - Delete scripts

## Setup

```bash
supabase link --project-ref slcasxwdsygaqxwsocwg
supabase functions deploy
```

## Environment Variables

Set in Supabase Dashboard:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY

## GitHub Actions

Auto-deploys on push to main. Add GitHub secret:
- SUPABASE_ACCESS_TOKEN

See DEPLOY.md for details.
