/**
 * ULTRON -> ESP32 DEVICE LINK — device telemetry.
 *
 * POST /api/esp/telemetry
 *
 * The device phones home here with battery, WiFi signal and its current face
 * state. Intentionally cheap and always-200: telemetry must never be able to
 * wedge the device, and the server must never be able to wedge the device
 * because telemetry failed.
 *
 * Body: { device_id?, token?, fw?, battery_pct?, battery_mv?, rssi?, state?,
 *         ai?, uptime_ms?, free_heap? }
 * 200:   { ok, server_time }
 *
 * Nothing is persisted by default (the web app has no device table, and adding
 * one would change the DB schema). This is a structured log line, so you get
 * `vercel logs` visibility into your device fleet for free. Set
 * ESP_TELEMETRY_FILE to a path and it is appended there as well, which is what
 * a self-hosted Node deployment can serve as a device history.
 *
 * ADDITIVE route.
 */

import { appendFile } from "node:fs/promises";
import { jsonError } from "@/lib/http";
import { checkDeviceToken, isValidFaceState, normalizeDeviceId } from "@/ai/esp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return Math.round(value);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const auth = checkDeviceToken(body.token);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const line = {
    device_id: normalizeDeviceId(body.device_id),
    fw: typeof body.fw === "string" ? body.fw.slice(0, 32) : "unknown",
    battery_pct: num(body.battery_pct, 0, 100),
    battery_mv: num(body.battery_mv, 0, 6000),
    rssi: num(body.rssi, -120, 0),
    state: isValidFaceState(body.state) ? body.state : null,
    ai: typeof body.ai === "string" ? body.ai.slice(0, 32) : null,
    uptime_ms: num(body.uptime_ms, 0, Number.MAX_SAFE_INTEGER),
    free_heap: num(body.free_heap, 0, 4_000_000),
    at: new Date().toISOString(),
  };

  const serialized = JSON.stringify(line);

  // A telemetry drop must never become a device problem: every write below is
  // best-effort and the device always gets its 200.
  try {
    console.log(`[esp] ${serialized}`);
  } catch {
    /* ignore */
  }

  const sink = process.env.ESP_TELEMETRY_FILE?.trim();
  if (sink) {
    try {
      await appendFile(sink, `${serialized}\n`, "utf8");
    } catch {
      /* ignore */
    }
  }

  return Response.json(
    { ok: true, server_time: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}