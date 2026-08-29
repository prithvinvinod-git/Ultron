import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  title: text("title").notNull().default("New conversation"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // system | user | assistant | tool
  content: text("content").notNull().default(""),
  toolCalls: text("tool_calls"), // serialized ToolCall[]
  provider: text("provider"),
  model: text("model"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("fact"), // fact | preference | decision
  scope: text("scope").notNull().default("global"), // global | session
  sessionId: text("session_id"),
  summary: text("summary").notNull(),
  detail: text("detail").notNull().default(""),
  tags: text("tags").notNull().default("[]"), // serialized string[]
  importance: integer("importance").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const providers = sqliteTable("providers", {
  key: text("key").primaryKey(), // "gemini" | "xai"
  label: text("label").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  priority: integer("priority").notNull().default(10),
});

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;