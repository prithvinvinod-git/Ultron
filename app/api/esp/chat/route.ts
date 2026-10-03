/**
 * ULTRON -> ESP32 DEVICE LINK — the device's chat endpoint.
 *
 * POST /api/esp/chat   (SSE stream, device protocol)
 *
 * This is a thin device-facing wrapper around the SAME agent the web UI uses
 * (`runAgent`). It does not fork, patch or replace the agent — it only
 * translates its ChatEvent stream into the small JSON vocabulary the firmware
 * understands, and attaches a face/motion directive on the final event.
 *
 * Body:  { device_id?, token?, session_id?, text, history?, voice?, provider?, model? }
 * 200:   text/event-stream, one `data: {json}` frame per event
 *
 * Frames emitted:
 *   { type:"state",       state:"thinking" }
 *   { type:"ai_delta",    text:"..." }            (streamed, ~10/s)
 *   { type:"ai_response", text, emotion, motion, tts, tts_text, session_id }
 *   { type:"error",       message }
 *   { type:"done" }
 *
 * ADDITIVE route. /api/chat and every shared module stay untouched.
 */

import { runAgent } from "@/ai/agent";
import { tryStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import { jsonError } from "@/lib/http";
import type { ChatMessage } from "@/ai/types";
import {
  checkDeviceToken,
  encodeEspComment,
  encodeEspEvent,
  isValidFaceState,
  type EspFaceState,
} from "@/ai/esp/protocol";
import {
  inferEmotion,
  inferMotion,
  toDisplayText,
  toSpokenText,
} from "@/ai/esp/directive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hard ceiling on one device turn. The OLED shows a timeout face if we hit it. */
const TURN_TIMEOUT_MS = 45_000;

/** Coarse agent activity -> face state, so the face reacts before the answer. */
const ACTIVITY_STATE: Record<string, EspFaceState> = {
  thinking: "thinking",
  searching: "thinking",
  reading: "thinking",
  generating: "speaking",
  calculating: "thinking",
  remembering: "thinking",
  working: "thinking",
};

/** Only user/assistant turns survive; tool traffic is the agent's business. */
function sanitizeHistory(value: unknown, text: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (Array.isArray(value)) {
    for (const m of value.slice(-8)) {
      if (!m || typeof m !== "object") continue;
      const row = m as Record<string, unknown>;
      const role = row.role;
      const content = typeof row.content === "string" ? row.content.trim() : "";
      if (!content || content.length > 2000) continue;
      if (role === "user" || role === "assistant") out.push({ role, content });
    }
  }
  // Whatever the device asked this turn is always the last user message.
  out.push({ role: "user", content: text });
  return out.length ? out : [{ role: "user", content: text }];
}

export async function POST(request: Request) {
  let body: {
    device_id?: unknown;
    token?: unknown;
    session_id?: unknown;
    text?: unknown;
    history?: unknown;
    voice?: unknown;
    provider?: unknown;
    model?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const auth = checkDeviceToken(body.token);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return jsonError(400, "text is required.");
  if (text.length > 2000) return jsonError(413, "text too long (max 2000 chars).");

  const sessionId =
    typeof body.session_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.session_id)
      ? body.session_id
      : randomUUID();
  const history = sanitizeHistory(body.history, text);

  // Persistence is best-effort: a store outage must not silence the device.
  const lastUser = text;
  await tryStore(async (store) => {
    const existing = await store.getSession(sessionId);
    if (!existing) await store.createSession({ id: sessionId, title: lastUser.slice(0, 60) });
    await store.insertMessage({
      id: randomUUID(),
      sessionId,
      role: "user",
      content: lastUser,
    });
  }, undefined);

  // Abort the upstream if the device hangs up, and cap the turn ourselves.
  const upstream = new AbortController();
  const onAbort = () => upstream.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => upstream.abort(), TURN_TIMEOUT_MS);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Flush partial text on a char budget rather than per token: keeps the
      // frame count sane over cellular-grade WiFi without adding real latency.
      let pending = "";
      let lastSentAt = Date.now();
      let content: string | null = null;
      let finalProvider = "";
      let finalModel = "";
      let failed = false;

      const flushDelta = (force: boolean) => {
        if (!pending) return;
        const now = Date.now();
        if (!force && now - lastSentAt < 90 && pending.length < 24) return;
        controller.enqueue(encodeEspEvent({ type: "ai_delta", text: pending }));
        pending = "";
        lastSentAt = now;
      };

      try {
        controller.enqueue(encodeEspEvent({ type: "state", state: "thinking" }));

        for await (const event of runAgent(history, {
          sessionId,
          signal: upstream.signal,
          voice: body.voice === true,
          providerName:
            typeof body.provider === "string" ? body.provider.slice(0, 32) : undefined,
          model: typeof body.model === "string" ? body.model.slice(0, 64) : undefined,
        })) {
          switch (event.type) {
            case "text":
              pending += event.text;
              flushDelta(false);
              break;

            case "activity": {
              const next = ACTIVITY_STATE[event.activity];
              if (next && isValidFaceState(next)) {
                controller.enqueue(encodeEspEvent({ type: "state", state: next }));
              }
              break;
            }

            case "done":
              content = event.content;
              finalProvider = event.provider;
              finalModel = event.model;
              break;

            case "error":
              failed = true;
              controller.enqueue(
                encodeEspEvent({ type: "error", message: event.message }),
              );
              break;

            default:
              // meta / reasoning / tool_* / memory are irrelevant on a 128x64
              // screen. Ignoring them here is the whole point of this wrapper.
              break;
          }
        }
      } catch (err) {
        failed = true;
        controller.enqueue(
          encodeEspEvent({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", onAbort);
      }

      flushDelta(true);

      const reply = (content ?? "").trim();
      if (reply) {
        const emotion = inferEmotion(reply);
        const motion = inferMotion(emotion, reply);
        controller.enqueue(
          encodeEspEvent({
            type: "ai_response",
            text: toDisplayText(reply),
            emotion,
            motion,
            tts: true,
            tts_text: toSpokenText(reply),
            session_id: sessionId,
          }),
        );
        await tryStore(async (store) => {
          await store.insertMessage({
            id: randomUUID(),
            sessionId,
            role: "assistant",
            content: reply,
            provider: finalProvider || null,
            model: finalModel || null,
          });
          await store.touchSession(sessionId, { title: reply.slice(0, 60) });
        }, undefined);
      } else if (!failed) {
        controller.enqueue(
          encodeEspEvent({
            type: "error",
            message: "Ultron had nothing to say. Try again?",
          }),
        );
      }

      controller.enqueue(encodeEspComment("bye"));
      controller.enqueue(encodeEspEvent({ type: "done" }));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}