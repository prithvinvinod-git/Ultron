import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Provider catalogue invariants.
 *
 * `app_arc.md` §17 forbids hardcoding model names across the app, which means the
 * catalogue is the single source of truth for what Settings offers. A duplicate
 * model id shipped to production once (xAI listed `grok-4-6` twice — once from
 * `MODEL_CHOICES`, once injected as the configured default), so that exact
 * regression is pinned below.
 */

const listProviders = vi.fn();

// Mock the *backend*, not `tryStore`, so the real fail-soft behaviour in
// `db/store.ts` is exercised end-to-end rather than assumed.
vi.mock("@/db/libsql-store", () => ({
  createStore: () => ({
    engine: "libsql-test",
    listProviders,
  }),
}));

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "XAI_API_KEY",
  "OPENROUTER_API_KEY",
  "GEMINI_MODEL",
  "XAI_MODEL",
  "OPENROUTER_MODEL",
  "FIREBASE_SERVICE_ACCOUNT",
  "GOOGLE_APPLICATION_CREDENTIALS",
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const key of ENV_KEYS) delete process.env[key];
  listProviders.mockReset();
  listProviders.mockResolvedValue(null); // store unreadable -> fallback path
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/**
 * Fresh module instance. `MODEL_BY_NAME` captures `process.env` at module
 * evaluation time, so env changes only take effect after a re-import.
 */
async function loadProviders() {
  vi.resetModules();
  return await import("@/ai/providers");
}

describe("getProviderCatalog", () => {
  it("lists every known provider in priority order", async () => {
    const { getProviderCatalog } = await loadProviders();
    expect(getProviderCatalog().map((p) => p.name)).toEqual([
      "gemini",
      "xai",
      "openrouter",
    ]);
  });

  it("never lists the same model twice for one provider", async () => {
    // Regression: xAI once rendered `grok-4-6` twice, so Settings showed a
    // duplicated entry for the configured default.
    process.env.XAI_API_KEY = "test";
    process.env.XAI_MODEL = "grok-4-6";
    const { getProviderCatalog } = await loadProviders();
    for (const provider of getProviderCatalog()) {
      const ids = provider.models.map((m) => m.id);
      expect(new Set(ids).size, `${provider.name} has duplicate model ids`).toBe(ids.length);
    }
  });

  it("does not duplicate a configured default that is already listed", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.GEMINI_MODEL = "gemini-3.6-flash"; // also in MODEL_CHOICES
    const { getProviderCatalog } = await loadProviders();
    const gemini = getProviderCatalog().find((p) => p.name === "gemini")!;
    expect(gemini.models.filter((m) => m.id === "gemini-3.6-flash")).toHaveLength(1);
  });

  it("injects a configured model that is absent from the static choices", async () => {
    process.env.XAI_API_KEY = "test";
    process.env.XAI_MODEL = "grok-5-experimental";
    const { getProviderCatalog } = await loadProviders();
    const xai = getProviderCatalog().find((p) => p.name === "xai")!;
    expect(xai.defaultModel).toBe("grok-5-experimental");
    expect(xai.models.map((m) => m.id)).toContain("grok-5-experimental");
  });

  it("treats XAI_MODEL as the source of truth rather than guessing an id", async () => {
    // XAI_MODEL_CHOICES is deliberately empty; an invented id would duplicate.
    process.env.XAI_API_KEY = "test";
    process.env.XAI_MODEL = "grok-4-6";
    const { getProviderCatalog } = await loadProviders();
    const xai = getProviderCatalog().find((p) => p.name === "xai")!;
    expect(xai.models).toHaveLength(1);
    expect(xai.models[0].id).toBe("grok-4-6");
  });

  it("marks a provider configured only when its API key is present", async () => {
    process.env.GEMINI_API_KEY = "test";
    const { getProviderCatalog } = await loadProviders();
    const byName = Object.fromEntries(
      getProviderCatalog().map((p) => [p.name, p.configured]),
    );
    expect(byName.gemini).toBe(true);
    expect(byName.xai).toBe(false);
    expect(byName.openrouter).toBe(false);
  });

  it("gives every model a label and description so Settings never renders blanks", async () => {
    process.env.GEMINI_API_KEY = "test";
    process.env.XAI_API_KEY = "test";
    process.env.OPENROUTER_API_KEY = "test";
    const { getProviderCatalog } = await loadProviders();
    for (const provider of getProviderCatalog()) {
      for (const model of provider.models) {
        expect(model.id.length, `${provider.name}/${model.id} id`).toBeGreaterThan(0);
        expect(model.label.length, `${provider.name}/${model.id} label`).toBeGreaterThan(0);
        expect(model.description.length, `${provider.name}/${model.id} description`).toBeGreaterThan(0);
      }
    }
  });

  it("offers at least one model per provider even with no environment at all", async () => {
    const { getProviderCatalog } = await loadProviders();
    for (const provider of getProviderCatalog()) {
      expect(provider.models.length, `${provider.name} has no models`).toBeGreaterThan(0);
    }
  });

  it("links to provider docs", async () => {
    const { getProviderCatalog } = await loadProviders();
    for (const provider of getProviderCatalog()) {
      expect(provider.docs).toMatch(/^https:\/\//);
    }
  });
});

describe("getProviderStatus — store unavailable", () => {
  it("still reports every provider when the store cannot be read", async () => {
    listProviders.mockResolvedValue(null);
    process.env.GEMINI_API_KEY = "test";
    const { getProviderStatus } = await loadProviders();
    const status = await getProviderStatus();
    expect(status.map((s) => s.name)).toEqual(["gemini", "xai", "openrouter"]);
    expect(status[0].configured).toBe(true);
    expect(status[0].defaultModel.length).toBeGreaterThan(0);
  });

  it("does not throw on a rejected store read", async () => {
    listProviders.mockRejectedValue(new Error("Quota exceeded"));
    const { getProviderStatus } = await loadProviders();
    await expect(getProviderStatus()).resolves.toBeInstanceOf(Array);
  });
});

describe("getConfiguredProviders — store unavailable", () => {
  it("falls back to every provider with a key, in priority order", async () => {
    listProviders.mockResolvedValue(null);
    process.env.GEMINI_API_KEY = "test";
    process.env.OPENROUTER_API_KEY = "test";
    const { getConfiguredProviders } = await loadProviders();
    const providers = await getConfiguredProviders();
    // Without a readable provider table the agent must still have a model,
    // otherwise a storage outage means no LLM at all.
    const names = providers.map((p) => p.config.name);
    expect(names).toContain("gemini");
    expect(names).toContain("openrouter");
    // gemini comes first in FALLBACK_PRIORITY, and xai has no key here.
    expect(names).not.toContain("xai");
    expect(names[0]).toBe("gemini");
  });

  it("returns an empty list when nothing is configured", async () => {
    listProviders.mockResolvedValue(null);
    const { getConfiguredProviders } = await loadProviders();
    await expect(getConfiguredProviders()).resolves.toEqual([]);
  });
});

describe("getProviderStatus — store readable", () => {
  it("uses the stored active flag and priority", async () => {
    listProviders.mockResolvedValue([
      { key: "xai", label: "xAI Grok", active: true, priority: 0 },
      { key: "gemini", label: "Google Gemini", active: false, priority: 1 },
    ]);
    const { getProviderStatus } = await loadProviders();
    const status = await getProviderStatus();
    expect(status.map((s) => s.name)).toEqual(["xai", "gemini"]);
    expect(status.find((s) => s.name === "gemini")!.active).toBe(false);
  });
});
