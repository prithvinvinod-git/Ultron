import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";
import { randomUUID } from "node:crypto";
import process from "node:process";

const url = process.env.TURSO_DATABASE_URL ?? "file:local.db";

// This script runs under plain Node (tsx), so it must not import "server-only".
const client = createClient({ url });
const db = drizzle(client, { schema });

async function ensureSchema() {
  const boot = createClient({ url });
  const sql = `
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      tool_calls TEXT,
      provider TEXT,
      model TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY NOT NULL,
      kind TEXT NOT NULL DEFAULT 'fact',
      scope TEXT NOT NULL DEFAULT 'global',
      session_id TEXT,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      importance INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS providers (
      key TEXT PRIMARY KEY NOT NULL,
      label TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 10
    );
  `;
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const statement of statements) {
    await boot.execute(statement);
  }
  await boot.close();
}

async function run() {
  await ensureSchema();
  await db.insert(schema.providers).values([
    { key: "gemini", label: "Google Gemini", active: true, priority: 1 },
    { key: "xai", label: "Grok (xAI)", active: true, priority: 2 },
  ]).onConflictDoNothing({ target: schema.providers.key });

  await db.insert(schema.memories).values({
    id: randomUUID(),
    kind: "fact",
    scope: "global",
    summary: "Ultron is a personal agentic assistant inspired by JARVIS.",
    detail: "Built on Next.js with pluggable LLM providers, local memory, and voice.",
    tags: JSON.stringify(["identity"]),
    importance: 3,
  }).onConflictDoNothing({ target: schema.memories.id });

  console.log("Seed complete.");
  await client.close();
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});