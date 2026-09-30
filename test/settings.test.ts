import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/settings.ts` is the shared preference store. It is `"use client"`, reads
 * `window.localStorage`, and memoises at module scope — so every test here gets a
 * fresh module and a fresh fake window.
 */

interface FakeWindow {
  localStorage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  };
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
  dispatchEvent(event: Event): boolean;
}

let storage: Map<string, string>;
let listeners: Map<string, Set<() => void>>;
let realWindow: unknown;

function installWindow() {
  storage = new Map<string, string>();
  listeners = new Map<string, Set<() => void>>();

  const fake: FakeWindow = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => void storage.set(key, value),
      removeItem: (key) => void storage.delete(key),
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type, fn) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(event) {
      for (const fn of listeners.get(event.type) ?? []) fn();
      return true;
    },
  };

  realWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = fake;
}

/** Fresh module instance so the memoised `cache` starts empty. */
async function loadSettings() {
  vi.resetModules();
  return await import("@/lib/settings");
}

beforeEach(() => {
  installWindow();
});

afterEach(() => {
  if (realWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = realWindow;
});

describe("readSettings", () => {
  it("returns defaults when storage is empty", async () => {
    const { readSettings, DEFAULT_SETTINGS } = await loadSettings();
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("has sane defaults for the behaviours the chat page depends on", async () => {
    const { DEFAULT_SETTINGS } = await loadSettings();
    expect(DEFAULT_SETTINGS.voiceKey).toBe("aria");
    // Empty means "let the agent choose" — Settings must not pin a provider.
    expect(DEFAULT_SETTINGS.provider).toBe("");
    expect(DEFAULT_SETTINGS.model).toBe("");
    expect(DEFAULT_SETTINGS.speakReplies).toBe(true);
    expect(DEFAULT_SETTINGS.bargeIn).toBe(true);
    expect(DEFAULT_SETTINGS.confirmVoice).toBe(false);
  });

  it("survives corrupt JSON in storage", async () => {
    storage.set("ultron.settings", "{not json");
    const { readSettings, DEFAULT_SETTINGS } = await loadSettings();
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores non-object JSON in storage", async () => {
    storage.set("ultron.settings", '"a string"');
    const { readSettings, DEFAULT_SETTINGS } = await loadSettings();
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("merges a partial stored object over the defaults", async () => {
    storage.set("ultron.settings", JSON.stringify({ bargeIn: false }));
    const { readSettings, DEFAULT_SETTINGS } = await loadSettings();
    const settings = readSettings();
    expect(settings.bargeIn).toBe(false);
    expect(settings.voiceKey).toBe(DEFAULT_SETTINGS.voiceKey);
    expect(settings.speakReplies).toBe(DEFAULT_SETTINGS.speakReplies);
  });

  it("memoises, which is what useSyncExternalStore requires", async () => {
    const { readSettings } = await loadSettings();
    // Referential stability between writes is required by React.
    expect(readSettings()).toBe(readSettings());
  });
});

describe("voiceKey storage", () => {
  it("is owned by useVoice, not written into the settings blob", async () => {
    // lib/settings.ts and use-voice share VOICE_STORAGE_KEY; if the key leaked
    // into ultron.settings the two owners could disagree.
    const { writeSettings, VOICE_STORAGE_KEY } = await loadSettings();
    writeSettings({ voiceKey: "nova" });
    expect(storage.get(VOICE_STORAGE_KEY)).toBe("nova");
    expect(JSON.parse(storage.get("ultron.settings")!)).not.toHaveProperty("voiceKey");
  });

  it("reads the voice key from its own storage entry", async () => {
    const { VOICE_STORAGE_KEY, readSettings } = await loadSettings();
    storage.set(VOICE_STORAGE_KEY, "echo");
    expect(readSettings().voiceKey).toBe("echo");
  });

  it("does not let a stale settings blob override the voice key", async () => {
    const { readSettings } = await loadSettings();
    storage.set("ultron.settings", JSON.stringify({ voiceKey: "stale" }));
    expect(readSettings().voiceKey).toBe("aria");
  });
});

describe("writeSettings", () => {
  it("returns the merged full value", async () => {
    const { writeSettings } = await loadSettings();
    expect(writeSettings({ bargeIn: false })).toMatchObject({ bargeIn: false, speakReplies: true });
  });

  it("accumulates patches across writes", async () => {
    const { writeSettings } = await loadSettings();
    writeSettings({ bargeIn: false });
    const after = writeSettings({ voiceKey: "nova" });
    expect(after.bargeIn).toBe(false);
    expect(after.voiceKey).toBe("nova");
  });

  it("persists across a module reload", async () => {
    const first = await loadSettings();
    first.writeSettings({ confirmVoice: true, provider: "xai" });
    // Fresh module = fresh cache; only localStorage can carry the value over.
    const second = await loadSettings();
    expect(second.readSettings()).toMatchObject({ confirmVoice: true, provider: "xai" });
  });

  it("notifies subscribers so the Settings tab re-reads", async () => {
    const { writeSettings } = await loadSettings();
    const seen: string[] = [];
    const handler = () => seen.push("changed");
    window.addEventListener("ultron:settings", handler);
    writeSettings({ bargeIn: false });
    window.removeEventListener("ultron:settings", handler);
    writeSettings({ bargeIn: true });
    expect(seen).toEqual(["changed"]);
  });

  it("does not throw when storage is unavailable", async () => {
    const { writeSettings, DEFAULT_SETTINGS } = await loadSettings();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
        removeItem: () => {},
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    };
    // Private mode / storage full: preferences just do not persist.
    expect(writeSettings({ bargeIn: false })).toMatchObject({ bargeIn: false });
    expect(DEFAULT_SETTINGS.bargeIn).toBe(true);
  });
});
