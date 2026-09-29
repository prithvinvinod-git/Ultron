import {
  createOpenAICompatProvider,
  parseModelList,
} from "@/ai/providers/openai-compat";
import type { Provider } from "@/ai/providers/types";

/**
 * Google Gemini via its official OpenAI-compatible endpoint.
 * Model ids can be overridden with GEMINI_MODEL (e.g. "gemini-3.6-flash",
 * "gemini-2.5-pro", or a Gemini 3.x lineup id).
 *
 * GEMINI_MODEL_FALLBACKS is a comma-separated list tried when the primary model
 * is rate-limited. Gemini's free tier meters requests per model, so this is
 * what keeps the primary provider usable once one model's daily cap is hit.
 */
export function createGeminiProvider(): Provider {
  const defaultModel = process.env.GEMINI_MODEL ?? "gemini-3.6-flash";
  return createOpenAICompatProvider({
    name: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY ?? "",
    defaultModel,
    fallbackModels: parseModelList(process.env.GEMINI_MODEL_FALLBACKS, defaultModel),
    docs: "https://ai.google.dev/gemini-api/docs/openai",
  });
}