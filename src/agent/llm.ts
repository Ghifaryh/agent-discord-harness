import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const FREE_MODEL =
  process.env.OPENROUTER_FREE_MODEL || "meta-llama/llama-3.2-3b-instruct:free";
const PAID_MODEL =
  process.env.OPENROUTER_PAID_MODEL || "anthropic/claude-sonnet-4";

export interface LLMResponse {
  content: string;
  model: string;
  usage: { prompt: number; completion: number };
}

export async function queryFree(
  systemPrompt: string,
  userMessage: string
): Promise<LLMResponse> {
  const res = await client.chat.completions.create({
    model: FREE_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const choice = res.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: FREE_MODEL,
    usage: {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
    },
  };
}

export async function queryPaid(
  systemPrompt: string,
  userMessage: string
): Promise<LLMResponse> {
  const res = await client.chat.completions.create({
    model: PAID_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  const choice = res.choices[0];
  return {
    content: choice?.message?.content ?? "",
    model: PAID_MODEL,
    usage: {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
    },
  };
}

export async function queryAuto(
  systemPrompt: string,
  userMessage: string
): Promise<LLMResponse> {
  return queryFree(systemPrompt, userMessage);
}

export { FREE_MODEL, PAID_MODEL };
