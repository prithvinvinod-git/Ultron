import { createOpenAICompatProvider } from "@/ai/providers/openai-compat";
import type { Provider } from "@/ai/providers/types";

/**
 * Google Gemini via its official OpenAI-compatible endpoint.
 * Model ids can be overridden with GEMINI_MODEL (e.g. "gemini-3.6-flash",
 * "gemini-2.5-pro", or a Gemini 3.x lineup id).
 */
export function createGeminiProvider(): Provider {
  return createOpenAICompatProvider({
    name: "gemini",
    label: "Google Gemini",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKey: process.env.GEMINI_API_KEY ?? "",
    defaultModel: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    docs: "https://ai.google.dev/gemini-api/docs/openai",
  });
}