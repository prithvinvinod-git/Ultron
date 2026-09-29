import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getStore } from "./store";

// This script runs under plain Node (tsx); it must not import "server-only".

// Next auto-loads .env.local into process.env; tsx does not, so load it here.
loadEnvFile(".env.local");

function loadEnvFile(path: string) {
  const full = resolve(process.cwd(), path);
  if (!existsSync(full)) return;
  for (const line of readFileSync(full, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    if (process.env[key] !== undefined) continue;
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    process.env[key] = unquoted;
  }
}

async function run() {
  const store = await getStore();
  console.log(`Seeding into backend: ${store.engine}`);

  await store.upsertProviders([
    // Gemini is the primary provider (lowest priority number wins), so the
    // app never depends on a locally running model server.
    { key: "gemini", label: "Google Gemini", active: true, priority: 1 },
    { key: "openrouter", label: "OpenRouter", active: true, priority: 2 },
    { key: "xai", label: "Grok (xAI)", active: true, priority: 3 },
  ]);

  const identityId = "00000000-0000-0000-0000-000000000001";
  const existing = await store.listMemories(500);
  if (!existing.some((m) => m.id === identityId)) {
    await store.saveMemory({
      id: identityId,
      kind: "fact",
      scope: "global",
      sessionId: null,
      summary: "Ultron is a personal agentic assistant inspired by JARVIS.",
      detail: "Built on Next.js with pluggable LLM providers, long-term memory, and voice.",
      tags: JSON.stringify(["identity"]),
      importance: 3,
      createdAt: new Date(),
    });
  }

  console.log(`Seed complete. identity=${identityId}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});