/**
 * ULTRON -> ESP32 DEVICE LINK — device TTS endpoint.
 *
 * GET /api/esp/tts?text=...&voice=jarvis&session_id=...
 *
 * Why this exists when /api/voice/tts already exists:
 * the browser can fetch audio with a POST body, but the ESP32 audio library
 * (`ESP8266Audio`) streams a plain GET URL straight into the I2S driver without
 * ever holding the whole clip in RAM. This route is the same synthesis path
 * exposed as a cacheable-free GET, streamed chunk by chunk.
 *
 * It reuses `synthesizeSpeech` from the existing voice module — no new engine,
 * no new key, no new dependency. The firmware gets `audio/mpeg` at 24 kHz
 * mono, which is what the free Edge engine already produces.
 *
 * ADDITIVE route. /api/voice/tts is unchanged.
 */

import { jsonError } from "@/lib/http";
import { synthesizeSpeech } from "@/ai/voice/speech";
import { checkDeviceToken } from "@/ai/esp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 480;
/** One chunk of audio handed to the socket per pull; ~4 kB keeps latency low. */
const CHUNK = 4096;

export async function GET(request: Request) {
  const url = new URL(request.url);

  const auth = checkDeviceToken(url.searchParams.get("token"));
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const text = (url.searchParams.get("text") ?? "").trim();
  if (!text) return jsonError(400, "text is required.");
  if (text.length > MAX_TEXT) {
    return jsonError(413, `text too long (max ${MAX_TEXT} chars).`);
  }

  const voice =
    url.searchParams.get("voice")?.trim() ||
    process.env.ESP_TTS_VOICE?.trim() ||
    "jarvis";

  const speech = await synthesizeSpeech(text, { voice });
  if (!speech || !speech.bytes.length) {
    // The firmware treats this as "speak is unavailable" and shows the text.
    return jsonError(503, "TTS synthesis failed.", { fallback: "text-only" });
  }

  const bytes = speech.bytes;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let off = 0; off < bytes.length; off += CHUNK) {
        controller.enqueue(new Uint8Array(bytes.subarray(off, off + CHUNK)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": speech.contentType,
      "Cache-Control": "no-store",
      "X-TTS-Engine": speech.engine,
      "X-Audio-Length": String(bytes.length),
      "X-Audio-Format": "mp3",
      "X-Audio-Sample-Rate": "24000",
    },
  });
}