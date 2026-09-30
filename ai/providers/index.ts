import "server-only";
import { tryStore } from "@/db/store";
import type { Provider } from "@/ai/providers/types";
import { createGeminiProvider } from "@/ai/providers/gemini";
import { createGrokProvider } from "@/ai/providers/grok";
import { createOpenRouterProvider } from "@/ai/providers/openrouter";

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
  if (process.env.OPENROUTER_API_KEY) map.openrouter = createOpenRouterProvider;
  return map;
}

const MODEL_BY_NAME: Record<string, string> = {
  gemini: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  xai: process.env.XAI_MODEL ?? "grok-4.6",
  openrouter: process.env.OPENROUTER_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
};

const LABEL_BY_NAME: Record<string, string> = {
  gemini: "Google Gemini",
  xai: "xAI Grok",
  openrouter: "OpenRouter",
};

/** Default provider priority, used when the provider table can't be read. */
const FALLBACK_PRIORITY = ["gemini", "xai", "openrouter"];

const DOCS_BY_NAME: Record<string, string> = {
  gemini: "https://ai.google.dev/gemini-api/docs/openai",
  xai: "https://docs.x.ai/docs/overview",
  openrouter: "https://openrouter.ai/docs",
};

/**
 * Active + configured providers in DB priority order (used by the agent).
 *
 * If the provider table can't be read (store down, quota exhausted) this falls
 * back to every provider that has a key set, in the default priority order —
 * otherwise a storage outage would leave the agent with no LLM at all.
 */
export async function getConfiguredProviders(): Promise<Provider[]> {
  const builders = registry();
  const rows = await tryStore((store) => store.listProviders(), null);
  if (!rows) {
    return FALLBACK_PRIORITY.filter((key) => builders[key]).map((key) =>
      builders[key](),
    );
  }
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
  const rows = await tryStore((store) => store.listProviders(), null);
  if (!rows) {
    return FALLBACK_PRIORITY.map((key, i) => ({
      name: key,
      label: LABEL_BY_NAME[key] ?? key,
      configured: Boolean(builders[key]),
      active: Boolean(builders[key]),
      priority: i,
      defaultModel: MODEL_BY_NAME[key] ?? "-",
      docs: DOCS_BY_NAME[key],
    }));
  }
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