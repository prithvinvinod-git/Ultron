import {
  cert,
  getApps,
  initializeApp,
  type ServiceAccount,
} from "firebase-admin/app";
import {
  getFirestore,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import type {
  CreateSessionInput,
  DataStore,
  InsertMessageInput,
  MemoryRow,
  MessageRow,
  ProviderRow,
  RecallOptions,
  SaveMemoryInput,
  SessionRow,
  SessionSummary,
} from "@/db/types";

function resolveCredentials(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    let json = raw.trim();
    if (!json.startsWith("{")) {
      json = Buffer.from(json, "base64").toString("utf8");
    }
    return JSON.parse(json) as ServiceAccount;
  }
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    return JSON.parse(readFileSync(path, "utf8")) as ServiceAccount;
  }
  throw new Error(
    "Firestore store requires FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS.",
  );
}

function db(): Firestore {
  if (getApps().length === 0) {
    const serviceAccount = resolveCredentials();
    const app = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.projectId,
    });
    const firestore = getFirestore(app);
    firestore.settings({ ignoreUndefinedProperties: true });
    return firestore;
  }
  const firestore = getFirestore();
  return firestore;
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date();
}

const isTrue = (value: unknown): boolean => value === true || value === 1 || value === "1";

function toSessionRow(
  id: string,
  data: FirebaseFirestore.DocumentData,
): SessionRow {
  return {
    id,
    title: String(data.title ?? "New conversation"),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toMessageRow(
  id: string,
  data: FirebaseFirestore.DocumentData,
): MessageRow {
  return {
    id,
    sessionId: String(data.sessionId ?? ""),
    role: String(data.role ?? ""),
    content: String(data.content ?? ""),
    toolCalls: data.toolCalls != null ? String(data.toolCalls) : null,
    provider: data.provider != null ? String(data.provider) : null,
    model: data.model != null ? String(data.model) : null,
    createdAt: toDate(data.createdAt),
  };
}

function toMemoryRow(
  id: string,
  data: FirebaseFirestore.DocumentData,
): MemoryRow {
  return {
    id,
    kind: String(data.kind ?? "fact"),
    scope: String(data.scope ?? "global"),
    sessionId: data.sessionId != null ? String(data.sessionId) : null,
    summary: String(data.summary ?? ""),
    detail: String(data.detail ?? ""),
    tags: String(data.tags ?? "[]"),
    importance: typeof data.importance === "number" ? data.importance : 1,
    createdAt: toDate(data.createdAt),
  };
}

function toProviderRow(
  key: string,
  data: FirebaseFirestore.DocumentData,
): ProviderRow {
  return {
    key,
    label: String(data.label ?? key),
    active: isTrue(data.active),
    priority: typeof data.priority === "number" ? data.priority : 10,
  };
}

const MAX_RECALL_SCAN = 150;

export function createStore(): DataStore {
  return {
    engine: "firestore",

    async getSession(id: string): Promise<SessionRow | null> {
      const ref = db().collection("sessions").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return null;
      return toSessionRow(id, snap.data() ?? {});
    },

    async createSession(input: CreateSessionInput): Promise<void> {
      await db().collection("sessions").doc(input.id).set({
        title: input.title,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    },

    async touchSession(
      id: string,
      updates: { title?: string; updatedAt?: Date },
    ): Promise<void> {
      const patch: Record<string, unknown> = {
        updatedAt: updates.updatedAt ?? new Date(),
      };
      if (updates.title !== undefined) patch.title = updates.title;
      await db().collection("sessions").doc(id).update(patch);
    },

    async listSessionsWithCounts(limit = 50): Promise<SessionSummary[]> {
      const snap = await db()
        .collection("sessions")
        .orderBy("updatedAt", "desc")
        .limit(limit)
        .get();
      const summaries = await Promise.all(
        snap.docs.map(async (doc) => {
          const row = toSessionRow(doc.id, doc.data());
          const countSnap = await db()
            .collection("sessions")
            .doc(doc.id)
            .collection("messages")
            .count()
            .get();
          return { ...row, messageCount: countSnap.data().count };
        }),
      );
      return summaries;
    },

    async deleteSession(id: string): Promise<void> {
      const sessionRef = db().collection("sessions").doc(id);
      const messagesSnap = await sessionRef.collection("messages").get();
      const batch = db().batch();
      for (const doc of messagesSnap.docs) {
        batch.delete(doc.ref);
      }
      batch.delete(sessionRef);
      await batch.commit();
    },

    async insertMessage(input: InsertMessageInput): Promise<void> {
      await db()
        .collection("sessions")
        .doc(input.sessionId)
        .collection("messages")
        .doc(input.id)
        .set({
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
      const snap = await db()
        .collection("sessions")
        .doc(sessionId)
        .collection("messages")
        .orderBy("createdAt", "asc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => toMessageRow(doc.id, doc.data()));
    },

    async countMessages(sessionId: string): Promise<number> {
      const snap = await db()
        .collection("sessions")
        .doc(sessionId)
        .collection("messages")
        .count()
        .get();
      return snap.data().count;
    },

    async countSessions(): Promise<number> {
      const snap = await db().collection("sessions").count().get();
      return snap.data().count;
    },

    async countMessagesAll(): Promise<number> {
      const snap = await db().collectionGroup("messages").count().get();
      return snap.data().count;
    },

    async recallMemories(options: RecallOptions): Promise<MemoryRow[]> {
      const { query, sessionId, kind, limit = 8 } = options;
      const globalQuery = db()
        .collection("memories")
        .orderBy("createdAt", "desc")
        .limit(MAX_RECALL_SCAN);

      const globalSnap = await globalQuery.get();
      const candidates = globalSnap.docs.map((doc) =>
        toMemoryRow(doc.id, doc.data()),
      );

      if (sessionId) {
        const sessionSnap = await db()
          .collection("memories")
          .where("sessionId", "==", sessionId)
          .limit(MAX_RECALL_SCAN)
          .get();
        const sessionRows = sessionSnap.docs.map((doc) =>
          toMemoryRow(doc.id, doc.data()),
        );
        const seen = new Set(candidates.map((m) => m.id));
        for (const row of sessionRows) {
          if (!seen.has(row.id)) {
            seen.add(row.id);
            candidates.push(row);
          }
        }
      }

      const needle = query?.trim().toLowerCase();
      const filtered = candidates.filter((m) => {
        if (kind && m.kind !== kind) return false;
        if (needle) {
          const haystack = `${m.summary} ${m.detail} ${m.tags}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });

      return filtered
        .sort(
          (a, b) =>
            b.importance - a.importance ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        )
        .slice(0, limit);
    },

    async listMemories(limit: number): Promise<MemoryRow[]> {
      const snap = await db()
        .collection("memories")
        .orderBy("createdAt", "desc")
        .limit(limit)
        .get();
      return snap.docs.map((doc) => toMemoryRow(doc.id, doc.data()));
    },

    async saveMemory(input: SaveMemoryInput): Promise<void> {
      await db().collection("memories").doc(input.id).set({
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
      const ref = db().collection("memories").doc(id);
      const doc = await ref.get();
      if (!doc.exists) return false;
      await ref.delete();
      return true;
    },

    async memoryCount(): Promise<number> {
      const snap = await db().collection("memories").count().get();
      return snap.data().count;
    },

    async listProviders(): Promise<ProviderRow[]> {
      const snap = await db()
        .collection("providers")
        .orderBy("priority", "asc")
        .get();
      return snap.docs.map((doc) => toProviderRow(doc.id, doc.data()));
    },

    async upsertProviders(rows: ProviderRow[]): Promise<void> {
      const firestore = db();
      const batch = firestore.batch();
      for (const row of rows) {
        batch.set(
          firestore.collection("providers").doc(row.key),
          {
            key: row.key,
            label: row.label,
            active: row.active,
            priority: row.priority,
          },
          { merge: true },
        );
      }
      await batch.commit();
    },
  };
}