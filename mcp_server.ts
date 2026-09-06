#!/usr/bin/env node
// Real MCP server for ScriptSnap. Replaces the previous mcp_server.ts, which
// was not an MCP server at all -- it used the raw Anthropic SDK's tool-use
// format (not the MCP protocol), had no transport (stdio/HTTP), and
// authenticated edge-function calls with a literal placeholder string
// ("demo_jwt_token_" + userId) that Supabase would reject outright.
//
// This server exposes ONE tool for now: generate_script, wired to the
// personalization loop that's the actual differentiator here -- every call
// pulls your top-performing keywords and tone ratings (from real ratings
// you've given past scripts) and feeds them into the prompt, then reports
// back exactly what was used so it's verifiable, not a black box.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const SUPABASE_URL = "https://slcasxwdsygaqxwsocwg.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsY2FzeHdkc3lnYXF4d3NvY3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3MjQ0OTgsImV4cCI6MjEwMjMwMDQ5OH0.bTZnM-mKN3kafqFDB2WTKyIk8LLgqHlhXInMDzJ9YUI";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Real auth: the caller's own ScriptSnap email/password, signed in against
// Supabase's actual auth API -- not a placeholder. Requires the account to
// have email/password enabled (it does -- see app/auth/login and
// app/auth/signup in scriptsnap-dashboard); a Google-OAuth-only account
// would need a password set first via "Forgot password".
const EMAIL = process.env.SCRIPTSNAP_EMAIL;
const PASSWORD = process.env.SCRIPTSNAP_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    "Missing SCRIPTSNAP_EMAIL / SCRIPTSNAP_PASSWORD env vars. Set these to " +
      "your ScriptSnap account credentials (email/password sign-in must be " +
      "enabled on the account -- use 'Forgot password' first if you normally " +
      "sign in with Google)."
  );
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cached across tool calls within one server run; supabase-js refreshes the
// underlying session automatically, but we re-derive the access token per
// call rather than trusting a long-lived local copy.
let signedIn = false;

async function getAccessToken(): Promise<string> {
  if (!signedIn) {
    const { error } = await supabase.auth.signInWithPassword({
      email: EMAIL!,
      password: PASSWORD!,
    });
    if (error) throw new Error(`ScriptSnap sign-in failed: ${error.message}`);
    signedIn = true;
  }
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new Error(`No active ScriptSnap session: ${error?.message ?? "unknown"}`);
  }
  return data.session.access_token;
}

async function callEdgeFunction(functionName: string, input: Record<string, unknown>) {
  const token = await getAccessToken();
  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json?.error ?? `${functionName} failed (${response.status})`);
  }
  return json;
}

const server = new McpServer({
  name: "scriptsnap-mcp",
  version: "2.0.0",
});

server.registerTool(
  "generate_script",
  {
    title: "Generate ScriptSnap script",
    description:
      "Generate a personalized YouTube Shorts script. Pulls your top-performing " +
      "keywords and tone ratings from past scripts you've rated on ScriptSnap " +
      "and feeds them into the prompt -- the response tells you exactly which " +
      "signals were used, so you can see the personalization working rather " +
      "than trusting it blindly.",
    inputSchema: {
      topic: z.string().describe("The topic for the script"),
      duration: z.number().min(10).max(90).describe("Video duration in seconds (10-90)"),
      category: z
        .enum([
          "Cultural & Historical",
          "Art & Design",
          "Science & Nature",
          "Fashion & Style",
          "Food & Craft",
          "Tech & Engineering",
        ])
        .describe("Content category"),
      tone: z.enum(["Meditative", "Balanced", "Energetic"]).describe("Script tone/style"),
      keywords: z.array(z.string()).optional().describe("Optional keywords to incorporate"),
      is_series: z.boolean().optional().describe("Is this part of a series?"),
    },
  },
  async ({ topic, duration, category, tone, keywords, is_series }) => {
    try {
      const result = await callEdgeFunction("generate-script", {
        topic,
        duration,
        category,
        tone,
        keywords: keywords ?? [],
        is_series: is_series ?? false,
      });

      const p = result.personalization ?? { keywordsUsed: [], toneStatsUsed: [] };
      const personalizationNote =
        p.keywordsUsed.length > 0 || p.toneStatsUsed.length > 0
          ? `\n\nPersonalized using: ${
              p.keywordsUsed.length > 0 ? `top keywords [${p.keywordsUsed.join(", ")}]` : ""
            }${p.keywordsUsed.length > 0 && p.toneStatsUsed.length > 0 ? "; " : ""}${
              p.toneStatsUsed.length > 0
                ? `tone ratings [${p.toneStatsUsed
                    .map((t: any) => `${t.tone}: ${t.avg_rating} stars`)
                    .join(", ")}]`
                : ""
            }`
          : "\n\n(No personalization signal yet -- rate a few scripts on ScriptSnap and this will kick in.)";

      return {
        content: [
          {
            type: "text",
            text: `${result.script?.script ?? "(no script returned)"}${personalizationNote}`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("scriptsnap-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal error in main():", err);
  process.exit(1);
});
