import "server-only";
import { and, count, desc, eq, like, or, SQL } from "drizzle-orm";
import { memories } from "@/db/schema";
import { db } from "@/db/client";
import { randomUUID } from "node:crypto";
import type { Memory } from "@/db/schema";

export interface MemoryInput {
  kind?: string;
  scope?: string;
  sessionId?: string | null;
  summary: string;
  detail?: string;
  tags?: string[];
  importance?: number;
}

export interface RecallOptions {
  query?: string;
  sessionId?: string;
  kind?: string;
  limit?: number;
}

/** Pulls relevant memories: global scope plus, when a session is given, that session's. */
export async function recallMemories(
  options: RecallOptions = {},
): Promise<Memory[]> {
  const { query, sessionId, kind, limit = 8 } = options;
  const conds: SQL[] = [];

  if (sessionId) {
    conds.push(or(eq(memories.scope, "global"), eq(memories.sessionId, sessionId))!);
  } else {
    conds.push(eq(memories.scope, "global"));
  }

  if (kind) conds.push(eq(memories.kind, kind));
  if (query) {
    const needle = `%${query}%`;
    conds.push(
      or(
        like(memories.summary, needle),
        like(memories.detail, needle),
        like(memories.tags, needle),
      )!,
    );
  }

  return db
    .select()
    .from(memories)
    .where(conds.length === 1 ? conds[0] : and(...conds))
    .orderBy(desc(memories.importance), desc(memories.createdAt))
    .limit(limit);
}

export async function saveMemory(input: MemoryInput): Promise<Memory> {
  const row: Memory = {
    id: randomUUID(),
    kind: input.kind ?? "fact",
    scope: input.scope ?? "global",
    sessionId: input.sessionId ?? null,
    summary: input.summary,
    detail: input.detail ?? "",
    tags: JSON.stringify(input.tags ?? []),
    importance: input.importance ?? 1,
    createdAt: new Date(),
  };
  await db.insert(memories).values(row);
  return row;
}

export async function listMemories(limit = 100): Promise<Memory[]> {
  return db
    .select()
    .from(memories)
    .orderBy(desc(memories.createdAt))
    .limit(limit);
}

export async function deleteMemory(id: string): Promise<boolean> {
  const result = await db
    .delete(memories)
    .where(eq(memories.id, id))
    .returning({ id: memories.id });
  return result.length > 0;
}

export async function memoryCount(): Promise<number> {
  const rows = await db.select({ value: count() }).from(memories);
  return rows[0]?.value ?? 0;
}

/** Renders memories into the concise "KEY MEMORIES" block used in the system prompt. */
export function renderMemories(rows: Memory[]): string {
  if (!rows.length) return "(none persisted yet)";
  return rows
    .map(
      (m) =>
        `- ${m.summary}${m.detail ? ` — ${m.detail}` : ""}` +
        (m.tags !== "[]" ? ` [${m.tags}]` : ""),
    )
    .join("\n");
}