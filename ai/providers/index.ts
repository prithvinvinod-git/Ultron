import "server-only";
import { asc } from "drizzle-orm";
import { providers } from "@/db/schema";
import { db } from "@/db/client";
import type { Provider } from "@/ai/providers/types";
import { createGeminiProvider } from "@/ai/providers/gemini";
import { createGrokProvider } from "@/ai/providers/grok";

export interface ProviderStatus {
  name: string;
  label: string;
  configured: boolean;
  active: boolean;
  priority: number;
  defaultModel: string;
  docs?: string;
}

/**
 * Builds provider factories from environment secrets. Any OpenAI-compatible
 * service can be added here (OpenRouter, local Ollama/vLLM, ...) and picked
 * up automatically once a key exists in the environment.
 */
function registry(): Record<string, () => Provider> {
  const map: Record<string, () => Provider> = {};
  if (process.env.GEMINI_API_KEY) map.gemini = createGeminiProvider;
  if (process.env.XAI_API_KEY) map.xai = createGrokProvider;
  return map;
}

const MODEL_BY_NAME: Record<string, string> = {
  gemini: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  xai: process.env.XAI_MODEL ?? "grok-4-6",
};

const DOCS_BY_NAME: Record<string, string> = {
  gemini: "https://ai.google.dev/gemini-api/docs/openai",
  xai: "https://docs.x.ai/docs/overview",
};

/** Active + configured providers in DB priority order (used by the agent). */
export async function getConfiguredProviders(): Promise<Provider[]> {
  const builders = registry();
  const rows = await db.select().from(providers).orderBy(asc(providers.priority));
  const list: Provider[] = [];
  for (const row of rows) {
    const build = builders[row.key];
    if (!build || !row.active) continue;
    list.push(build());
  }
  return list;
}

/** Status for the /system view: everything we know about, configured or not. */
export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const builders = registry();
  const rows = await db.select().from(providers).orderBy(asc(providers.priority));
  return rows.map((row) => ({
    name: row.key,
    label: row.label,
    configured: Boolean(builders[row.key]),
    active: row.active,
    priority: row.priority,
    defaultModel: MODEL_BY_NAME[row.key] ?? "-",
    docs: DOCS_BY_NAME[row.key],
  }));
}