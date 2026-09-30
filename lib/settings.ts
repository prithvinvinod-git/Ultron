"use client";

import * as React from "react";

/**
 * Shared, tab-persisted preferences.
 *
 * These live in localStorage rather than component state so the settings page
 * and the chat page can both own them: the settings page writes, the chat page
 * reads at the moment it needs a value (voice key on mount, provider/model when
 * it posts a turn), and a route change remounts the reader. No store, no
 * subscription, no server round-trip — and nothing here costs a Firestore read.
 */

/** Owned by useVoice as well; kept here so the two can never drift apart. */
export const VOICE_STORAGE_KEY = "ultron.tts.voice";
const SETTINGS_KEY = "ultron.settings";

export interface AppSettings {
  /** TTS voice key, matching `GET /api/voice/voices`. */
  voiceKey: string;
  /** Speak assistant replies automatically as they land. */
  speakReplies: boolean;
  /** Preferred provider; "" lets the agent choose. */
  provider: string;
  /** Preferred model within that provider; "" uses the provider default. */
  model: string;
  /** Let the user cut in while Ultron is speaking or working. */
  bargeIn: boolean;
  /** Require an explicit send gesture before a spoken turn is submitted. */
  confirmVoice: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  voiceKey: "aria",
  speakReplies: true,
  provider: "",
  model: "",
  bargeIn: true,
  confirmVoice: false,
};

type Persisted = Omit<AppSettings, "voiceKey">;

let cache: AppSettings | null = null;

function parsePersisted(): Partial<Persisted> {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readVoiceKey(): string {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY) || DEFAULT_SETTINGS.voiceKey;
  } catch {
    return DEFAULT_SETTINGS.voiceKey;
  }
}

export function readSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  cache ??= { ...DEFAULT_SETTINGS, ...parsePersisted(), voiceKey: readVoiceKey() };
  return cache;
}

/** Merges a patch into the stored settings and returns the new full value. */
export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  const next: AppSettings = { ...readSettings(), ...patch };
  const { voiceKey, ...persisted } = next;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(persisted));
    window.localStorage.setItem(VOICE_STORAGE_KEY, voiceKey);
  } catch {
    // Private mode / storage full — preferences just won't persist.
  }
  cache = next;
  // Tell any `useSettings()` subscribers (the Settings tab) to re-read.
  window.dispatchEvent(new Event(SETTINGS_EVENT));
  return next;
}

const SETTINGS_EVENT = "ultron:settings";

function subscribeSettings(onChange: () => void): () => void {
  window.addEventListener(SETTINGS_EVENT, onChange);
  // Another tab writing the same keys.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SETTINGS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Live view of the stored settings.
 *
 * `readSettings` memoizes its result, so the snapshot is referentially stable
 * between writes — which is what `useSyncExternalStore` requires.
 */
export function useSettings(): AppSettings {
  return React.useSyncExternalStore(subscribeSettings, readSettings, () => DEFAULT_SETTINGS);
}
