# ScriptSnap Backend Deployment Guide

## Prerequisites
- GitHub CLI (`gh`) installed
- Supabase CLI installed: `npm install -g supabase`
- Deno runtime (included with Supabase CLI)

---

## STEP 1: Setup Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref slcasxwdsygaqxwsocwg
```

---

## STEP 2: Deploy Functions Locally (Test)

```bash
# Start local Supabase environment
supabase start

# This will output your local API URL (usually http://localhost:54321)

# In another terminal, deploy functions
supabase functions deploy
```

---

## STEP 3: Deploy to Production (Supabase)

```bash
# Deploy all functions to your Supabase project
supabase functions deploy

# You should see:
# ✓ Function 'generate-script' deployed with ID: xxx
# ✓ Function 'rate-script' deployed with ID: xxx
# ✓ Function 'get-library' deployed with ID: xxx
# ✓ Function 'delete-script' deployed with ID: xxx
```

---

## STEP 4: Set Environment Variables (Supabase Dashboard)

1. Go to: https://app.supabase.com
2. Select your project (slcasxwdsygaqxwsocwg)
3. Go to: **Settings → Functions → Environment Variables**
4. Add these 3 variables:

```
SUPABASE_URL = https://slcasxwdsygaqxwsocwg.supabase.co
SUPABASE_SERVICE_ROLE_KEY = YOUR_SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY = YOUR_ANTHROPIC_API_KEY
```

5. Click **Save**

---

## STEP 5: Test Functions

### Get JWT Token (for testing)
```bash
# Create a test user
curl -X POST https://slcasxwdsygaqxwsocwg.supabase.co/auth/v1/signup \
  -H "apikey: sb_publishable_eCiMvpVtTbJt4IZIwVTX0A_WeX4yKXp" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "Test123!@#"
  }'
```

This returns a response with `session.access_token`. Copy that token.

---

### Test Generate Script Function

```bash
curl -X POST https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/generate-script \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Japanese tea ceremony",
    "duration": 30,
    "category": "Cultural & Historical",
    "context": "",
    "keywords": ["ritual", "patience", "mindfulness"],
    "is_series": false,
    "tone": "Meditative",
    "tone_index": 1
  }'
```

**Expected response:**
```json
{
  "success": true,
  "script": {
    "id": "xxx-xxx-xxx",
    "topic": "Japanese tea ceremony",
    "script": "[ full script text ]",
    "title": "...",
    "description": "...",
    "hashtags": ["#tea", "#culture", "#ritual", "#mindfulness"],
    ...
  }
}
```

---

### Test Rate Script Function

```bash
curl -X POST https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/rate-script \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "script_id": "SCRIPT_ID_FROM_ABOVE",
    "rating": 5,
    "notes": "Great script!",
    "performance_notes": "50K views, high engagement"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "message": "Script rated! AI is learning your preferences."
}
```

---

### Test Get Library Function

```bash
curl https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/get-library?limit=10&sort_by=recent \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

**Expected response:**
```json
{
  "success": true,
  "scripts": [
    {
      "id": "...",
      "topic": "...",
      "rating": 5,
      ...
    }
  ],
  "insights": {
    "total_scripts": 1,
    "avg_rating": 5,
    "best_performing_tone": "Meditative",
    "best_tone_rating": 5,
    "top_keywords": [
      {"keyword": "ritual", "rating": 5},
      {"keyword": "patience", "rating": 5}
    ],
    ...
  },
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 1
  }
}
```

---

## STEP 6: Monitor Logs

```bash
# View function logs
supabase functions list

# View specific function logs
supabase functions download generate-script

# Or in Supabase Dashboard:
# Settings → Functions → Logs
```

---

## STEP 7: GitHub Actions Auto-Deploy (Optional)

Create `.github/workflows/deploy-functions.yml`:

```yaml
name: Deploy Functions to Supabase

on:
  push:
    branches:
      - main
    paths:
      - 'supabase/functions/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: denoland/setup-deno@v1
        with:
          deno-version: latest
      
      - run: |
          npm install -g supabase
          supabase link --project-ref slcasxwdsygaqxwsocwg
          supabase functions deploy
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

**To set up GitHub secrets:**
1. Go to: GitHub Repo → Settings → Secrets and variables → Actions
2. Create new secret: `SUPABASE_ACCESS_TOKEN`
3. Value: Your Supabase personal access token (https://supabase.com/dashboard/account/tokens)

---

## Troubleshooting

### "Function not found" error
- Make sure you deployed with `supabase functions deploy`
- Check that environment variables are set

### "Unauthorized" error
- Make sure JWT token is valid
- Check Authorization header format: `Bearer YOUR_TOKEN`

### "ANTHROPIC_API_KEY not found"
- Set environment variables in Supabase Dashboard
- Restart functions after setting variables

### Script generation fails
- Check Anthropic API key is valid
- Check API has available credits
- View logs: `supabase functions download generate-script`

---

## Function URLs

Once deployed, your functions are available at:

- **Generate Script**: `https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/generate-script`
- **Rate Script**: `https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/rate-script`
- **Get Library**: `https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/get-library`
- **Delete Script**: `https://slcasxwdsygaqxwsocwg.supabase.co/functions/v1/delete-script`

---

## Next Steps

1. ✅ Deploy Edge Functions (THIS STEP)
2. → Build MCP Connector (calls these functions)
3. → Build Frontend Dashboard (calls these functions)
4. → Add Stripe integration (for Pro tier)
