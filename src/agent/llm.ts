import OpenAI from "openai";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.AI_PROVIDER_API_KEY) {
      throw new Error("AI_PROVIDER_API_KEY is required but not set");
    }
    if (!process.env.AI_PROVIDER_BASE_URL) {
      throw new Error("AI_PROVIDER_BASE_URL is required but not set");
    }
    _client = new OpenAI({
      baseURL: process.env.AI_PROVIDER_BASE_URL,
      apiKey: process.env.AI_PROVIDER_API_KEY,
      defaultHeaders: {
        "User-Agent": "agent-discord-harness/0.1",
      },
    });
  }
  return _client;
}

const MODEL = process.env.DEFAULT_MODEL || "test-hemat-ga-ya";

export interface LLMResponse {
  content: string;
  model: string;
  usage: { prompt: number; completion: number };
}

export async function queryLLM(
  systemPrompt: string,
  userMessage: string
): Promise<LLMResponse> {
  const client = getClient();
  const res = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const choice = res.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: MODEL,
    usage: {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
    },
  };
}

export { MODEL };
