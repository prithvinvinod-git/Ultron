export interface SessionRow {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSummary extends SessionRow {
  messageCount: number;
}

export interface MessageRow {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  toolCalls: string | null;
  provider: string | null;
  model: string | null;
  createdAt: Date;
}

export interface MemoryRow {
  id: string;
  kind: string;
  scope: string;
  sessionId: string | null;
  summary: string;
  detail: string;
  tags: string;
  importance: number;
  createdAt: Date;
}

export interface ProviderRow {
  key: string;
  label: string;
  active: boolean;
  priority: number;
}

export interface RecallOptions {
  query?: string;
  sessionId?: string;
  kind?: string;
  limit?: number;
}

export interface CreateSessionInput {
  id: string;
  title: string;
}

export interface InsertMessageInput {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  toolCalls?: string | null;
  provider?: string | null;
  model?: string | null;
  createdAt?: Date;
}

export interface SaveMemoryInput {
  id: string;
  kind: string;
  scope: string;
  sessionId?: string | null;
  summary: string;
  detail: string;
  tags: string;
  importance: number;
  createdAt?: Date;
}

export interface DataStore {
  readonly engine: string;
  getSession(id: string): Promise<SessionRow | null>;
  createSession(input: CreateSessionInput): Promise<void>;
  touchSession(
    id: string,
    updates: { title?: string; updatedAt?: Date },
  ): Promise<void>;
  listSessionsWithCounts(limit?: number): Promise<SessionSummary[]>;
  deleteSession(id: string): Promise<void>;
  insertMessage(input: InsertMessageInput): Promise<void>;
  listMessages(sessionId: string, limit?: number): Promise<MessageRow[]>;
  countMessages(sessionId: string): Promise<number>;
  countSessions(): Promise<number>;
  countMessagesAll(): Promise<number>;
  recallMemories(options: RecallOptions): Promise<MemoryRow[]>;
  listMemories(limit: number): Promise<MemoryRow[]>;
  saveMemory(input: SaveMemoryInput): Promise<void>;
  deleteMemory(id: string): Promise<boolean>;
  memoryCount(): Promise<number>;
  listProviders(): Promise<ProviderRow[]>;
  upsertProviders(rows: ProviderRow[]): Promise<void>;
}