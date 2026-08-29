import { transcribeSpeech } from "@/ai/voice/speech";
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

  const result = await transcribeSpeech(
    Buffer.from(audioB64, "base64"),
    body.mimeType ?? "audio/webm",
  );
  if (!result) {
    return jsonError(
      501,
      "Server-side transcription requires GROQ_API_KEY. The client should use the browser Web Speech API instead.",
      { fallback: "browser" },
    );
  }

  return Response.json({
    ok: true,
    text: result.text,
    engine: "groq-whisper",
  });
}