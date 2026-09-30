import type { DataStore } from "@/db/types";

export type { DataStore };

/**
 * Picks the active persistence backend:
 *  - "firestore": Firebase Cloud Firestore (set FIREBASE_SERVICE_ACCOUNT or
 *    GOOGLE_APPLICATION_CREDENTIALS)
 *  - "libsql":   local/remote libSQL (default, zero-config file:local.db)
 */
export function pickBackend(): "firestore" | "libsql" {
  return process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? "firestore"
    : "libsql";
}

let cachedStore: DataStore | null = null;

export async function getStore(): Promise<DataStore> {
  if (cachedStore) return cachedStore;
  const backend = pickBackend();
  const storeModule =
    backend === "firestore"
      ? await import("@/db/firestore-store")
      : await import("@/db/libsql-store");
  try {
    const store = storeModule.createStore();
    cachedStore = store;
    return store;
  } catch (err) {
    // Surface the real reason (bad/missing credentials, etc.) instead of an
    // opaque 500, so /api/health and the server logs can explain the failure.
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`[${backend}] store init failed: ${reason}`);
  }
}

/**
 * Runs a store call and swallows backend failures (quota exhausted, bad
 * credentials, network), returning `fallback` instead of throwing.
 *
 * Persistence is not a prerequisite for answering: a chat turn should still
 * complete and stream when the database is down, just without history. Use
 * this anywhere a store failure must not take down the request; use plain
 * `getStore()` where losing the write would be silently wrong.
 */
export async function tryStore<T>(
  fn: (store: DataStore) => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn(await getStore());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`[store:${pickBackend()}] call failed: ${reason}`);
    return fallback;
  }
}