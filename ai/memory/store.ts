import "server-only";
import { tryStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import type { MemoryRow as Memory } from "@/db/types";

export type { Memory };

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

/**
 * Memory reads and writes are best-effort: when the store is unavailable these
 * degrade to "no memories" rather than failing the whole agent turn. A save
 * still returns the row it built so callers can confirm to the user, it just
 * may not have been persisted.
 */

/** Pulls relevant memories: global scope plus, when a session is given, that session's. */
export async function recallMemories(
  options: RecallOptions = {},
): Promise<Memory[]> {
  return tryStore((store) => store.recallMemories(options), []);
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
  await tryStore((store) => store.saveMemory(row).then(() => true), false);
  return row;
}

export async function listMemories(limit = 100): Promise<Memory[]> {
  return tryStore((store) => store.listMemories(limit), []);
}

export async function deleteMemory(id: string): Promise<boolean> {
  return tryStore((store) => store.deleteMemory(id), false);
}

export async function memoryCount(): Promise<number> {
  return tryStore((store) => store.memoryCount(), 0);
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