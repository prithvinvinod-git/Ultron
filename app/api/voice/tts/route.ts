import { synthesizeSpeech } from "@/ai/voice/speech";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: { text?: string; voice?: string; engine?: "edge" | "elevenlabs" };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const text = (body.text ?? "").trim();
  if (!text) return jsonError(400, "text is required.");
  if (text.length > 4000) return jsonError(413, "text too long (max 4000 chars).");

  const speech = await synthesizeSpeech(text, {
    voice: body.voice,
    engine: body.engine,
  });
  if (!speech) {
    return jsonError(
      503,
      "TTS synthesis failed. The client can fall back to the browser speech synthesizer.",
      { fallback: "browser" },
    );
  }

  return new Response(new Uint8Array(speech.bytes), {
    headers: {
      "Content-Type": speech.contentType,
      "Cache-Control": "no-store",
      "X-TTS-Engine": speech.engine,
    },
  });
}
