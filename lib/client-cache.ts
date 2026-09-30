"use client";

/**
 * Tiny sessionStorage cache for Firestore-backed reads.
 *
 * Every page mount used to refetch the session list, and each of those fetches
 * is a billed read. A personal assistant rarely changes its own data mid-tab, so
 * the last good response is kept briefly and reused on the next mount. Fresh
 * writes still force a refetch through `clearCache`.
 */
const PREFIX = "ultron:cache:";

interface Entry<T> {
  at: number;
  value: T;
}

export function readCache<T>(key: string, ttlMs: number): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.at !== "number") return null;
    if (Date.now() - entry.at > ttlMs) return null;
    return entry.value;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    const entry: Entry<T> = { at: Date.now(), value };
    window.sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Private mode or a full quota — the cache is best-effort.
  }
}

export function clearCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}
