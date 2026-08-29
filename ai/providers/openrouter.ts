import { createOpenAICompatProvider } from "@/ai/providers/openai-compat";
import type { Provider } from "@/ai/providers/types";

/**
 * OpenRouter via its OpenAI-compatible endpoint. Free `:free` models need no
 * billing but still require the (free) API key from https://openrouter.ai/keys.
 * Model id can be overridden with OPENROUTER_MODEL.
 */
export function createOpenRouterProvider(): Provider {
  return createOpenAICompatProvider({
    name: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultModel: process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
    docs: "https://openrouter.ai/docs",
  });
}