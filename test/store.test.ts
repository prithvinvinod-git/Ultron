import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `db/store.ts` is the seam that lets a database outage fail soft instead of
 * taking chat down. That behaviour was load-bearing during a real Firestore
 * quota exhaustion, so it is pinned here.
 */

const listProviders = vi.fn();
const memoryCount = vi.fn();

vi.mock("@/db/libsql-store", () => ({
  createStore: () => ({
    engine: "libsql-test",
    listProviders,
    memoryCount,
  }),
}));

const FIREBASE_ENV = ["FIREBASE_SERVICE_ACCOUNT", "GOOGLE_APPLICATION_CREDENTIALS"] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(FIREBASE_ENV.map((k) => [k, process.env[k]]));
  for (const key of FIREBASE_ENV) delete process.env[key];
  listProviders.mockReset();
  memoryCount.mockReset();
});

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/** Fresh module instance: `getStore` memoises, and env is read per call. */
async function loadStore() {
  vi.resetModules();
  return await import("@/db/store");
}

describe("pickBackend", () => {
  it("defaults to libSQL when no Firebase credentials are present", async () => {
    const { pickBackend } = await loadStore();
    expect(pickBackend()).toBe("libsql");
  });

  it("selects Firestore when a service account is configured", async () => {
    process.env.FIREBASE_SERVICE_ACCOUNT = "{}";
    const { pickBackend } = await loadStore();
    expect(pickBackend()).toBe("firestore");
  });

  it("selects Firestore when application credentials are configured", async () => {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/path/to/creds.json";
    const { pickBackend } = await loadStore();
    expect(pickBackend()).toBe("firestore");
  });

  it("treats an empty credential string as absent", async () => {
    // Prevents a blanked-out env var in CI from silently switching backends.
    process.env.FIREBASE_SERVICE_ACCOUNT = "";
    const { pickBackend } = await loadStore();
    expect(pickBackend()).toBe("libsql");
  });
});

describe("tryStore", () => {
  it("returns the caller's value when the store works", async () => {
    listProviders.mockResolvedValue([{ key: "gemini" }]);
    const { tryStore } = await loadStore();
    const rows = await tryStore((store) => store.listProviders(), null);
    expect(rows).toEqual([{ key: "gemini" }]);
  });

  it("returns the fallback when the store call throws", async () => {
    // This is the quota-exhaustion path: the request must still complete.
    listProviders.mockRejectedValue(new Error("Quota exceeded"));
    const { tryStore } = await loadStore();
    const rows = await tryStore((store) => store.listProviders(), null);
    expect(rows).toBeNull();
  });

  it("returns the fallback when the backend cannot even be constructed", async () => {
    memoryCount.mockRejectedValue(new Error("store init failed"));
    const { tryStore } = await loadStore();
    await expect(tryStore((store) => store.memoryCount(), -1)).resolves.toBe(-1);
  });

  it("does not throw, whatever the backend does", async () => {
    listProviders.mockRejectedValue(new Error("network down"));
    const { tryStore } = await loadStore();
    await expect(
      tryStore((store) => store.listProviders(), null),
    ).resolves.not.toThrow();
  });

  it("passes the resolved store into the callback", async () => {
    listProviders.mockResolvedValue([]);
    const { tryStore } = await loadStore();
    await tryStore(async (store) => {
      expect(store.engine).toBe("libsql-test");
      return null;
    }, null);
    expect(listProviders).not.toHaveBeenCalled();
  });
});
