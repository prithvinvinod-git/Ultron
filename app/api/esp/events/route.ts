import { NextRequest, NextResponse } from "next/server";
import { checkDeviceToken, encodeEspEvent, encodeEspComment } from "@/ai/esp/protocol";
import {
  getEventsSince,
  getLatestEventId,
  addEspListener,
  type EspResponseEvent,
} from "@/ai/esp/broadcast";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || request.headers.get("x-device-token");

  const auth = checkDeviceToken(token);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const since = parseInt(searchParams.get("since") || "0", 10);
  const isStream = searchParams.get("stream") === "1" || request.headers.get("accept") === "text/event-stream";

  if (isStream) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Send initial comment
        controller.enqueue(encodeEspComment("esp_event_stream_active"));

// Flush any unread events since requested ID
        const missed = getEventsSince(since);
        for (const ev of missed) {
          controller.enqueue(encodeEspEvent({
            type: "ai_response",
            text: ev.text,
            emotion: ev.emotion,
            motion: ev.motion,
            tts: ev.tts,
            tts_text: ev.tts_text,
            session_id: ev.session_id,
          }));
        }

        // Subscribe to live broadcast events
        const unsubscribe = addEspListener((ev: EspResponseEvent) => {
          try {
            controller.enqueue(encodeEspEvent({
              type: "ai_response",
              text: ev.text,
              emotion: ev.emotion,
              motion: ev.motion,
              tts: ev.tts,
              tts_text: ev.tts_text,
              session_id: ev.session_id,
            }));
          } catch {
            // Stream closed
          }
        });

        // Periodic keepalive ping every 15 seconds
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encodeEspComment("ping"));
          } catch {
            clearInterval(pingInterval);
          }
        }, 15000);

        request.signal.addEventListener("abort", () => {
          unsubscribe();
          clearInterval(pingInterval);
          controller.close();
        });
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

  // Standard JSON polling response
  const newEvents = getEventsSince(since);
  const latestId = getLatestEventId();

  return NextResponse.json({
    ok: true,
    has_event: newEvents.length > 0,
    events: newEvents,
    latest_id: latestId,
  });
}
