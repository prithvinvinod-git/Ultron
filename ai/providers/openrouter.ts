import {
  createOpenAICompatProvider,
  parseModelList,
} from "@/ai/providers/openai-compat";
import type { Provider } from "@/ai/providers/types";

/**
 * OpenRouter via its OpenAI-compatible endpoint. Free `:free` models need no
 * billing but still require the (free) API key from https://openrouter.ai/keys.
 * Model id can be overridden with OPENROUTER_MODEL, with
 * OPENROUTER_MODEL_FALLBACKS as a comma-separated rotation for busy `:free`
 * models (the free pool is frequently overloaded).
 */
export function createOpenRouterProvider(): Provider {
  const defaultModel =
    process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";
  return createOpenAICompatProvider({
    name: "openrouter",
    label: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    defaultModel,
    fallbackModels: parseModelList(
      process.env.OPENROUTER_MODEL_FALLBACKS,
      defaultModel,
    ),
    docs: "https://openrouter.ai/docs",
  });
}