import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Your Supabase project details
const SUPABASE_URL = "https://slcasxwdsygaqxwsocwg.supabase.co";
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;

// Store user JWT tokens (in real app, get from auth)
const userTokens: Record<string, string> = {};

// Tool definitions matching server.json
const tools = [
  {
    name: "generate_script",
    description:
      "Generate an AI script for YouTube Shorts with SEO metadata and 10 title variations",
    input_schema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "The topic for the script",
        },
        duration: {
          type: "number",
          description: "Video duration in seconds (10-90)",
        },
        category: {
          type: "string",
          enum: [
            "Cultural & Historical",
            "Art & Design",
            "Science & Nature",
            "Fashion & Style",
            "Food & Craft",
            "Tech & Engineering",
          ],
          description: "Content category",
        },
        tone: {
          type: "string",
          enum: ["Meditative", "Balanced", "Energetic"],
          description: "Script tone/style",
        },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Optional keywords to incorporate",
        },
        is_series: {
          type: "boolean",
          description: "Is this part of a series?",
        },
      },
      required: ["topic", "duration", "category", "tone"],
    },
  },
  {
    name: "rate_script",
    description: "Rate a script (1-5 stars) to help AI learn",
    input_schema: {
      type: "object",
      properties: {
        script_id: {
          type: "string",
          description: "ID of the script to rate",
        },
        rating: {
          type: "number",
          description: "Rating from 1-5 stars",
        },
        notes: {
          type: "string",
          description: "Optional notes about the rating",
        },
      },
      required: ["script_id", "rating"],
    },
  },
];

// Call Edge Functions
async function callEdgeFunction(
  functionName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<unknown> {
  // Get or create JWT token for user
  let token = userTokens[userId];

  if (!token) {
    // In a real app, get this from Supabase auth
    // For now, use a demo token
    token = "demo_jwt_token_" + userId;
    userTokens[userId] = token;
  }

  const response = await fetch(`${FUNCTIONS_URL}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Function call failed: ${response.statusText}`);
  }

  return response.json();
}

// Process tool calls
async function processToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  userId: string
): Promise<string> {
  try {
    if (toolName === "generate_script") {
      const result = await callEdgeFunction(
        "generate-script",
        {
          topic: toolInput.topic,
          duration: toolInput.duration,
          category: toolInput.category,
          tone: toolInput.tone,
          keywords: toolInput.keywords || [],
          is_series: toolInput.is_series || false,
          tone_index: ["Meditative", "Balanced", "Energetic"].indexOf(
            toolInput.tone as string
          ) + 1,
        },
        userId
      );
      return JSON.stringify(result);
    } else if (toolName === "rate_script") {
      const result = await callEdgeFunction(
        "rate-script",
        {
          script_id: toolInput.script_id,
          rating: toolInput.rating,
          notes: toolInput.notes,
        },
        userId
      );
      return JSON.stringify(result);
    }
    return JSON.stringify({ error: "Unknown tool" });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

// Main agent loop
async function runAgent(userMessage: string, userId: string): Promise<void> {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`User: ${userMessage}`);
  console.log("=".repeat(50));

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: userMessage,
    },
  ];

  // Agentic loop
  while (true) {
    const response = await client.messages.create({
      model: "claude-opus-4-1",
      max_tokens: 1024,
      tools: tools as Anthropic.Messages.Tool[],
      messages: messages,
    });

    console.log(`\nClaude (stop_reason: ${response.stop_reason}):`);

    // Check if we should stop
    if (response.stop_reason === "end_turn") {
      // Extract final text response
      for (const block of response.content) {
        if (block.type === "text") {
          console.log(block.text);
        }
      }
      break;
    }

    // Process tool uses
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        console.log(block.text);
      } else if (block.type === "tool_use") {
        console.log(`\nTool: ${block.name}`);
        console.log(`Input: ${JSON.stringify(block.input, null, 2)}`);

        const result = await processToolCall(
          block.name,
          block.input as Record<string, unknown>,
          userId
        );
        console.log(`Result: ${result}`);

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    // Add assistant response and tool results to messages
    messages.push({
      role: "assistant",
      content: response.content,
    });

    if (toolResults.length > 0) {
      messages.push({
        role: "user",
        content: toolResults,
      });
    } else {
      // No tool calls, we're done
      break;
    }
  }
}

// Run example
runAgent(
  "Generate me a YouTube Shorts script about Japanese pottery, 30 seconds, meditative tone, with keywords 'handmade' and 'clay'",
  "demo_user_123"
).catch(console.error);
