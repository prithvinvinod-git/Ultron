/**
 * ULTRON -> ESP32 DEVICE LINK — device TTS endpoint.
 *
 * GET /api/esp/tts?text=...&voice=jarvis&session_id=...
 *
 * Why this exists when /api/voice/tts already exists:
 * the browser can fetch audio with a POST body, but the ESP32 audio library
 * (`ESP8266Audio`) fetches a plain GET URL and feeds the response straight into
 * the I2S driver. This route is the same synthesis path exposed as a GET.
 *
 * It reuses `synthesizeSpeech` from the existing voice module — no new engine,
 * no new key, no new dependency. The firmware gets `audio/mpeg` at 24 kHz
 * mono, which is what the free Edge engine already produces.
 *
 * The body is returned as a single buffer with an explicit Content-Length.
 * Returning a ReadableStream instead makes Vercel reply with
 * `Transfer-Encoding: chunked`, and the audio library does not de-chunk, so the
 * chunk-size lines get decoded as samples and the speaker outputs noise. See
 * the comment at the return below.
 *
 * ADDITIVE route. /api/voice/tts is unchanged.
 */

import { jsonError } from "@/lib/http";
import { synthesizeSpeech } from "@/ai/voice/speech";
import { checkDeviceToken } from "@/ai/esp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 480;

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

  // Sent as ONE body with an explicit Content-Length, never as a
  // ReadableStream. A stream makes Vercel answer with
  // `Transfer-Encoding: chunked` and no Content-Length, and the ESP32's audio
  // library does not de-chunk: it hands the raw response to the MP3 decoder,
  // so the chunk-size lines (e.g. "1a0\r\n") are decoded as audio and the
  // speaker outputs garbage instead of speech. synthesizeSpeech has already
  // buffered the whole clip, so streaming bought no latency anyway.
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": speech.contentType,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-TTS-Engine": speech.engine,
      "X-Audio-Length": String(bytes.length),
      "X-Audio-Format": "mp3",
      "X-Audio-Sample-Rate": "24000",
    },
  });
}