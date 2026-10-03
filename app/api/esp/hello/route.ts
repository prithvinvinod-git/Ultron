/**
 * ULTRON -> ESP32 DEVICE LINK — device handshake.
 *
 * POST /api/esp/hello
 *
 * The device calls this right after WiFi comes up. It doubles as a reachability
 * probe ("is the server actually there?") and as capability negotiation, so
 * the firmware knows which TTS format to ask for before the first reply.
 *
 * Body:  { device_id?, token?, fw?, caps?: { servo?, audio?, oled?, battery? } }
 * 200:   { ok, protocol, server_time, session_id, device_id, tts, motions, states }
 *
 * ADDITIVE route. Does not touch /api/chat or any shared pipeline.
 */

import { randomUUID } from "node:crypto";
import { jsonError } from "@/lib/http";
import { tryStore } from "@/db/store";
import {
  ESP_FACE_STATES,
  ESP_MOTIONS,
  ESP_PROTOCOL_VERSION,
  checkDeviceToken,
  normalizeDeviceId,
} from "@/ai/esp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The voice the device is told to request. Must exist in EDGE_VOICES. */
const DEVICE_VOICE = process.env.ESP_TTS_VOICE?.trim() || "jarvis";

/** Edge read-aloud emits MP3; the firmware decodes it with ESP8266Audio. */
const DEVICE_TTS_FORMAT = "mp3";
const DEVICE_TTS_SAMPLE_RATE = 24000;

export async function POST(request: Request) {
  let body: {
    device_id?: unknown;
    token?: unknown;
    fw?: unknown;
    session_id?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const auth = checkDeviceToken(body.token);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const deviceId = normalizeDeviceId(body.device_id);
  const fw = typeof body.fw === "string" ? body.fw.slice(0, 32) : "unknown";

  // Reuse the device's session when it has one so a reboot keeps the thread,
  // otherwise mint a fresh id and let the chat route persist it.
  const sessionId =
    typeof body.session_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.session_id)
      ? body.session_id
      : randomUUID();

  // Make sure the session exists before the first chat turn, so persistence
  // never fails on a missing row. Best-effort: the chat turn still answers.
  await tryStore(async (store) => {
    const existing = await store.getSession(sessionId);
    if (!existing) {
      await store.createSession({ id: sessionId, title: deviceId });
    }
  }, undefined);

  return Response.json(
    {
      ok: true,
      protocol: ESP_PROTOCOL_VERSION,
      server_time: new Date().toISOString(),
      device_id: deviceId,
      fw,
      session_id: sessionId,
      tts: {
        available: true,
        voice: DEVICE_VOICE,
        format: DEVICE_TTS_FORMAT,
        sample_rate: DEVICE_TTS_SAMPLE_RATE,
        endpoint: "/api/esp/tts",
      },
      /** Whitelists so the firmware can assert it agrees with the server. */
      motions: ESP_MOTIONS,
      states: ESP_FACE_STATES,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  // Cheap reachability probe that needs no body — handy from a browser or curl.
  return Response.json({
    ok: true,
    protocol: ESP_PROTOCOL_VERSION,
    server_time: new Date().toISOString(),
    device_auth: Boolean(process.env.ESP_DEVICE_TOKEN?.trim()),
    endpoints: ["/api/esp/hello", "/api/esp/chat", "/api/esp/tts", "/api/esp/telemetry"],
  });
}