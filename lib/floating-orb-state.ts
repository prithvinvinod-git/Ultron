/**
 * Floating Orb State Management
 *
 * Persistent storage and state machine for the floating AI orb in PWA live mode.
 * Handles:
 * - Live mode preference persistence
 * - Orb lifecycle state (idle, listening, thinking, speaking, error)
 * - Microphone permissions
 * - Background/foreground transitions
 */

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "error";

export interface OrbPersistence {
  liveMode: boolean;
  timestamp: number;
}

export interface OrbConfig {
  enableFloatingOrb: boolean;
  enableBackground: boolean;
  autoRestoreOnForeground: boolean;
}

const STORAGE_KEY = "ultron:orb-persistence";
const CONFIG_KEY = "ultron:orb-config";

/**
 * Load persisted orb preferences from localStorage
 */
export function loadOrbPreferences(): OrbPersistence {
  if (typeof window === "undefined") return { liveMode: false, timestamp: 0 };

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as OrbPersistence;
      // Don't restore live mode if > 10 mins old (PWA backgrounded/closed)
      if (Date.now() - data.timestamp < 10 * 60 * 1000) {
        return data;
      }
    }
  } catch {
    // Ignore parse errors
  }

  return { liveMode: false, timestamp: 0 };
}

/**
 * Save orb preferences to localStorage
 */
export function saveOrbPreferences(prefs: OrbPersistence): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      liveMode: prefs.liveMode,
      timestamp: Date.now(),
    }));
  } catch {
    // Ignore quota/permission errors
  }
}

/**
 * Load orb configuration from localStorage
 */
export function loadOrbConfig(): OrbConfig {
  if (typeof window === "undefined") {
    return {
      enableFloatingOrb: true,
      enableBackground: false,
      autoRestoreOnForeground: true,
    };
  }

  try {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored) as OrbConfig;
    }
  } catch {
    // Ignore parse errors
  }

  return {
    enableFloatingOrb: true,
    enableBackground: false,
    autoRestoreOnForeground: true,
  };
}

/**
 * Save orb configuration to localStorage
 */
export function saveOrbConfig(config: OrbConfig): void {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Ignore quota/permission errors
  }
}

/**
 * Detect if PWA is entering foreground (from background)
 * Uses Page Visibility API and visibility change events
 */
export function onForeground(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      callback();
    }
  };

  const handleFocus = () => {
    callback();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("focus", handleFocus);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleFocus);
  };
}

/**
 * Detect if PWA is entering background
 */
export function onBackground(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      callback();
    }
  };

  const handleBlur = () => {
    callback();
  };

  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("blur", handleBlur);

  return () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
  };
}

/**
 * Check microphone permission status
 */
export async function checkMicrophonePermission(): Promise<PermissionStatus | null> {
  if (typeof navigator === "undefined" || !navigator.permissions) {
    return null;
  }

  try {
    return await navigator.permissions.query({ name: "microphone" as PermissionName });
  } catch {
    return null;
  }
}

/**
 * Request microphone access and handle permission flow
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return false;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Close the stream immediately; we just needed to trigger the permission prompt
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (err) {
    // NotAllowedError: user denied permission
    // NotFoundError: no microphone available
    // NotSupportedError: platform doesn't support
    console.warn("Microphone access denied:", err);
    return false;
  }
}

/**
 * Determine if device is mobile/tablet
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent.toLowerCase();
  return (
    /mobile|android|iphone|ipad|tablet|kindle|playbook/.test(ua) ||
    navigator.maxTouchPoints > 1
  );
}

/**
 * Detect if running as PWA (installed)
 */
export function isRunningAsPWA(): boolean {
  if (typeof window === "undefined") return false;

  // Check for display-mode: standalone or fullscreen
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.matchMedia("(display-mode: fullscreen)").matches) return true;

  // Check for navigator.standalone (iOS)
  if ("standalone" in navigator && (navigator as any).standalone === true) return true;

  return false;
}

/**
 * Get safe-area insets for notched devices (iPhone 12+, Android with notch)
 */
export function getSafeAreaInsets(): {
  top: string;
  right: string;
  bottom: string;
  left: string;
} {
  if (typeof window === "undefined") {
    return { top: "0", right: "0", bottom: "0", left: "0" };
  }

  const style = getComputedStyle(document.documentElement);
  return {
    top: style.getPropertyValue("--safe-area-inset-top") || "0",
    right: style.getPropertyValue("--safe-area-inset-right") || "0",
    bottom: style.getPropertyValue("--safe-area-inset-bottom") || "0",
    left: style.getPropertyValue("--safe-area-inset-left") || "0",
  };
}
