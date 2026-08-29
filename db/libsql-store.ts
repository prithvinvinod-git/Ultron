import {
  and,
  asc,
  count,
  desc,
  eq,
  like,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import { memories, messages, providers, sessions } from "@/db/schema";
import type {
  CreateSessionInput,
  InsertMessageInput,
  MemoryRow,
  MessageRow,
  ProviderRow,
  RecallOptions,
  SaveMemoryInput,
  SessionRow,
  SessionSummary,
} from "@/db/types";

function toSessionRow(row: typeof sessions.$inferSelect): SessionRow {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessageRow(row: typeof messages.$inferSelect): MessageRow {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role,
    content: row.content,
    toolCalls: row.toolCalls,
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt,
  };
}

function toMemoryRow(row: typeof memories.$inferSelect): MemoryRow {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    sessionId: row.sessionId,
    summary: row.summary,
    detail: row.detail,
    tags: row.tags,
    importance: row.importance,
    createdAt: row.createdAt,
  };
}

function toProviderRow(row: typeof providers.$inferSelect): ProviderRow {
  return {
    key: row.key,
    label: row.label,
    active: row.active,
    priority: row.priority,
  };
}

const store: DataStore = {
  engine: "libsql",

  async getSession(id: string): Promise<SessionRow | null> {
    const rows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
    return rows[0] ? toSessionRow(rows[0]) : null;
  },

  async createSession(input: CreateSessionInput): Promise<void> {
    await db.insert(sessions).values({ id: input.id, title: input.title });
  },

  async touchSession(
    id: string,
    updates: { title?: string; updatedAt?: Date },
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: updates.updatedAt ?? new Date() };
    if (updates.title !== undefined) set.title = updates.title;
    await db.update(sessions).set(set).where(eq(sessions.id, id));
  },

  async listSessionsWithCounts(limit = 50): Promise<SessionSummary[]> {
    const rows = await db
      .select({
        id: sessions.id,
        title: sessions.title,
        createdAt: sessions.createdAt,
        updatedAt: sessions.updatedAt,
        messageCount: count(messages.id),
      })
      .from(sessions)
      .leftJoin(messages, eq(messages.sessionId, sessions.id))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.updatedAt))
      .limit(limit);
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      messageCount: row.messageCount,
    }));
  },

  async deleteSession(id: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.id, id));
  },

  async insertMessage(input: InsertMessageInput): Promise<void> {
    await db.insert(messages).values({
      id: input.id,
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      toolCalls: input.toolCalls ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      createdAt: input.createdAt ?? new Date(),
    });
  },

  async listMessages(sessionId: string, limit = 200): Promise<MessageRow[]> {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.createdAt))
      .limit(limit);
    return rows.map(toMessageRow);
  },

  async countMessages(sessionId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));
    return rows[0]?.value ?? 0;
  },

  async countSessions(): Promise<number> {
    const rows = await db.select({ value: count() }).from(sessions);
    return rows[0]?.value ?? 0;
  },

  async countMessagesAll(): Promise<number> {
    const rows = await db.select({ value: count() }).from(messages);
    return rows[0]?.value ?? 0;
  },

  async recallMemories(options: RecallOptions): Promise<MemoryRow[]> {
    const { query, sessionId, kind, limit = 8 } = options;
    const conds: SQL[] = [];
    if (sessionId) {
      conds.push(
        or(eq(memories.scope, "global"), eq(memories.sessionId, sessionId))!,
      );
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
    const rows = await db
      .select()
      .from(memories)
      .where(conds.length === 1 ? conds[0] : and(...conds))
      .orderBy(desc(memories.importance), desc(memories.createdAt))
      .limit(limit);
    return rows.map(toMemoryRow);
  },

  async listMemories(limit: number): Promise<MemoryRow[]> {
    const rows = await db
      .select()
      .from(memories)
      .orderBy(desc(memories.createdAt))
      .limit(limit);
    return rows.map(toMemoryRow);
  },

  async saveMemory(input: SaveMemoryInput): Promise<void> {
    await db.insert(memories).values({
      id: input.id,
      kind: input.kind,
      scope: input.scope,
      sessionId: input.sessionId ?? null,
      summary: input.summary,
      detail: input.detail,
      tags: input.tags,
      importance: input.importance,
      createdAt: input.createdAt ?? new Date(),
    });
  },

  async deleteMemory(id: string): Promise<boolean> {
    const result = await db
      .delete(memories)
      .where(eq(memories.id, id))
      .returning({ id: memories.id });
    return result.length > 0;
  },

  async memoryCount(): Promise<number> {
    const rows = await db.select({ value: count() }).from(memories);
    return rows[0]?.value ?? 0;
  },

  async listProviders(): Promise<ProviderRow[]> {
    const rows = await db
      .select()
      .from(providers)
      .orderBy(asc(providers.priority));
    return rows.map(toProviderRow);
  },

  async upsertProviders(rows: ProviderRow[]): Promise<void> {
    await db
      .insert(providers)
      .values(
        rows.map((row) => ({
          key: row.key,
          label: row.label,
          active: row.active,
          priority: row.priority,
        })),
      )
      .onConflictDoUpdate({
        target: providers.key,
        set: {
          label: sql`excluded.label`,
          active: sql`excluded.active`,
          priority: sql`excluded.priority`,
        },
      });
  },
};

import type { DataStore } from "@/db/types";

let instance: DataStore | null = null;

export function createStore(): DataStore {
  instance ??= store;
  return instance;
}