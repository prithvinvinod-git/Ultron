import { createOpenAICompatProvider } from "@/ai/providers/openai-compat";
import type { Provider } from "@/ai/providers/types";

/**
 * Grok (xAI) via its OpenAI-compatible endpoint.
 * Model id can be overridden with XAI_MODEL (e.g. "grok-4.6",
 * "grok-4-latest", ...).
 */
export function createGrokProvider(): Provider {
  return createOpenAICompatProvider({
    name: "xai",
    label: "Grok (xAI)",
    baseURL: "https://api.x.ai/v1",
    apiKey: process.env.XAI_API_KEY ?? "",
    defaultModel: process.env.XAI_MODEL ?? "grok-4.6",
    docs: "https://docs.x.ai/docs/overview",
  });
}