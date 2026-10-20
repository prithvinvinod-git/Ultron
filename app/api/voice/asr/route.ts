import { transcribeSpeech, TranscriptionError } from "@/ai/voice/speech";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { audio?: string; mimeType?: string; text?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  // Optional echo path: when the browser's Web Speech API produced the text,
  // the client may still want to run it through the agent untouched.
  if (typeof body.text === "string" && body.text.trim()) {
    return Response.json({ ok: true, text: body.text.trim(), engine: "browser" });
  }

  const audioB64 = body.audio ?? "";
  if (!audioB64) return jsonError(400, "audio (base64) is required.");

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(audioB64) || audioB64.length > 36_000_000) {
    return jsonError(413, "Audio upload is invalid or too large.");
  }
  try {
    const result = await transcribeSpeech(Buffer.from(audioB64, "base64"), body.mimeType ?? "audio/webm");
    return Response.json({ ok: true, text: result.text, engine: "groq-whisper" });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      const status = error.code === "not_configured" ? 503 : error.code === "too_large" ? 413 : error.code === "rate_limited" ? 429 : 502;
      return jsonError(status, error.message, { code: error.code, fallback: "browser" });
    }
    return jsonError(502, "Voice transcription failed.", { code: "upstream", fallback: "browser" });
  }
}
