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
  cachedStore = storeModule.createStore();
  return cachedStore;
}