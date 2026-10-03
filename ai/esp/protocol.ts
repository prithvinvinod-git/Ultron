/**
 * ULTRON -> ESP32 DEVICE LINK
 * ----------------------------
 * Shared vocabulary for the physical device (ESP32 + OLED + servo + speaker).
 *
 * This file is ADDITIVE. It does not modify or import anything from the web
 * app's chat/agent pipeline except read-only type helpers, so the existing
 * infra stays exactly as it is.
 *
 * The device speaks a tiny JSON protocol over HTTPS + SSE:
 *
 *   device -> server   POST /api/esp/hello      (handshake)
 *                       POST /api/esp/chat       (ask Ultron something)
 *                       POST /api/esp/telemetry  (battery / rssi / state)
 *                       GET  /api/esp/tts        (stream TTS audio)
 *
 *   server -> device   SSE frames on /api/esp/chat, each `data: {json}`
 */

/** Bumped only when the wire format changes incompatibly. */
export const ESP_PROTOCOL_VERSION = 1;

/** Face states the OLED renderer knows how to draw. Keep in sync with the firmware. */
export const ESP_FACE_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "happy",
  "sad",
  "angry",
  "confused",
  "surprised",
  "excited",
  "sleeping",
  "error",
  "offline",
] as const;

export type EspFaceState = (typeof ESP_FACE_STATES)[number];

/**
 * The ONLY servo animations the device will accept. The server can never send
 * a raw angle — the firmware maps these names onto a hard-clamped keyframe
 * table. Adding a name here does nothing until the firmware implements it.
 */
export const ESP_MOTIONS = [
  "center",
  "nod",
  "nod_fast",
  "look_left",
  "look_right",
  "tilt_left",
  "tilt_right",
  "excited",
  "confused",
  "thinking",
  "sleep",
] as const;

export type EspMotion = (typeof ESP_MOTIONS)[number];

export function isValidMotion(value: unknown): value is EspMotion {
  return (
    typeof value === "string" &&
    (ESP_MOTIONS as readonly string[]).includes(value)
  );
}

export function isValidFaceState(value: unknown): value is EspFaceState {
  return (
    typeof value === "string" &&
    (ESP_FACE_STATES as readonly string[]).includes(value)
  );
}

/** Frames written to the SSE stream. Kept flat so the firmware parser is trivial. */
export type EspEvent =
  | { type: "hello"; protocol: number; device_id: string; session_id: string; server_time: string; tts: { available: boolean; voice: string; format: string; sample_rate: number } }
  | { type: "state"; state: EspFaceState }
  | { type: "ai_delta"; text: string }
  | { type: "ai_response"; text: string; emotion: EspFaceState; motion: EspMotion; tts: boolean; tts_text: string; session_id: string }
  | { type: "error"; message: string }
  | { type: "done" };

export function encodeEspEvent(event: EspEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function encodeEspComment(text: string): Uint8Array {
  return new TextEncoder().encode(`: ${text}\n\n`);
}

/**
 * Shared-secret device auth.
 *
 * Set ESP_DEVICE_TOKEN in the deployment env to require it. If it is unset the
 * endpoints stay open, which is convenient while the device is on your own
 * bench but should not ship to a public URL.
 *
 * The token is compared with a timing-safe-ish comparison and is optional per
 * instance, so a device provisioned before the token existed keeps working.
 */
export function checkDeviceToken(
  presented: unknown,
): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ESP_DEVICE_TOKEN?.trim();
  if (!expected) return { ok: true };
  if (typeof presented !== "string" || presented.length === 0) {
    return { ok: false, status: 401, error: "Missing device token." };
  }
  // Length-independent comparison so the loop always walks both buffers.
  let diff = expected.length ^ presented.length;
  const n = Math.max(expected.length, presented.length);
  for (let i = 0; i < n; i++) {
    diff |= (expected.charCodeAt(i) || 0) ^ (presented.charCodeAt(i) || 0);
  }
  if (diff !== 0) {
    return { ok: false, status: 401, error: "Invalid device token." };
  }
  return { ok: true };
}

/** Normalises whatever the firmware calls itself into something loggable. */
export function normalizeDeviceId(value: unknown): string {
  if (typeof value !== "string") return "unknown";
  const clean = value.trim().replace(/[^A-Za-z0-9_.:-]/g, "").slice(0, 64);
  return clean || "unknown";
}