import "server-only";

const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface SpeechResult {
  bytes: Buffer;
  contentType: string;
  engine: "groq" | "livekit";
}

export interface TtsOptions {
  /** Personality label for the voice; passed through to the engine. */
  voice?: string;
}

/**
 * Synthesizes speech for text. Tries Groq PlayAI TTS (free tier) first, then
 * LiveKit Inference (free Build plan, fishaudio/s2.1-pro-free). Returns null
 * when no TTS backend is configured — the UI falls back to the browser's
 * SpeechSynthesis in that case.
 */
export async function synthesizeSpeech(
  text: string,
  options: TtsOptions = {},
): Promise<SpeechResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  if (process.env.GROQ_API_KEY) {
    try {
      const res = await fetch(`${GROQ_BASE}/audio/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "playai-tts",
          input: trimmed.slice(0, 4000),
          voice: options.voice ?? "Bella",
        }),
      });
      if (res.ok) {
        return {
          bytes: Buffer.from(await res.arrayBuffer()),
          contentType:
            res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
          engine: "groq",
        };
      }
    } catch {
      // fall through to the next engine on network/decode errors
    }
  }

  if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET) {
    try {
      const basic = Buffer.from(
        `${process.env.LIVEKIT_API_KEY}:${process.env.LIVEKIT_API_SECRET}`,
      ).toString("base64");
      const res = await fetch("https://api.livekit.io/v1/inference/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify({
          model: "fishaudio/s2.1-pro-free",
          text: trimmed.slice(0, 4000),
        }),
      });
      if (res.ok) {
        return {
          bytes: Buffer.from(await res.arrayBuffer()),
          contentType:
            res.headers.get("content-type")?.split(";")[0] || "audio/wav",
          engine: "livekit",
        };
      }
    } catch {
      // fall through to the browser synthesizer on network errors
    }
  }

  return null;
}

/**
 * Transcribes a WebM/Opus audio blob with Groq Whisper (free tier).
 * Returns null when GROQ_API_KEY is not set — the browser's Web Speech API
 * is used as the free client-side fallback instead.
 */
export async function transcribeSpeech(audio: Buffer, mimeType = "audio/webm") {
  if (!process.env.GROQ_API_KEY) return null;

  const form = new FormData();
  const bytes = new Uint8Array(audio);
  form.append(
    "file",
    new File([bytes], "voice.webm", { type: mimeType }),
    "voice.webm",
  );
  form.append("model", "whisper-large-v3");
  form.append("language", "en");

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { text?: string };
  return { text: data.text ?? "" };
}

export function voiceEnginesConfigured(): {
  tts: ("groq" | "livekit")[];
  stt: ("groq" | "browser")[];
} {
  return {
    tts: [
      ...(process.env.GROQ_API_KEY ? (["groq"] as const) : []),
      ...(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET
        ? (["livekit"] as const)
        : []),
    ],
    stt: [
      ...(process.env.GROQ_API_KEY ? (["groq"] as const) : []),
      "browser",
    ],
  };
}