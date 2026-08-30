import "server-only";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

export type TtsEngine = "edge" | "elevenlabs" | "groq" | "livekit";

export interface SpeechResult {
  bytes: Buffer;
  contentType: string;
  engine: TtsEngine;
}

export interface TtsOptions {
  /** Friendly voice key (see EDGE_VOICES / ELEVEN_VOICES) or a raw engine voice id. */
  voice?: string;
}

/** A curated set of natural Microsoft Edge neural voices (free, no key required). */
export interface TtsVoiceDef {
  key: string;
  engine: "edge" | "elevenlabs";
  name: string;
  gender: "female" | "male";
  locale: string;
  accent: string;
  /** Engine-specific voice id (Edge short name or ElevenLabs voice id). */
  id: string;
}

export const EDGE_VOICES: TtsVoiceDef[] = [
  { key: "aria", engine: "edge", name: "Aria", gender: "female", locale: "en-US", accent: "American", id: "en-US-AriaNeural" },
  { key: "jenny", engine: "edge", name: "Jenny", gender: "female", locale: "en-US", accent: "American", id: "en-US-JennyNeural" },
  { key: "michelle", engine: "edge", name: "Michelle", gender: "female", locale: "en-US", accent: "American", id: "en-US-MichelleNeural" },
  { key: "ana", engine: "edge", name: "Ana", gender: "female", locale: "en-US", accent: "American", id: "en-US-AnaNeural" },
  { key: "guy", engine: "edge", name: "Guy", gender: "male", locale: "en-US", accent: "American", id: "en-US-GuyNeural" },
  { key: "christopher", engine: "edge", name: "Christopher", gender: "male", locale: "en-US", accent: "American", id: "en-US-ChristopherNeural" },
  { key: "eric", engine: "edge", name: "Eric", gender: "male", locale: "en-US", accent: "American", id: "en-US-EricNeural" },
  { key: "sonia", engine: "edge", name: "Sonia", gender: "female", locale: "en-GB", accent: "British", id: "en-GB-SoniaNeural" },
  { key: "libby", engine: "edge", name: "Libby", gender: "female", locale: "en-GB", accent: "British", id: "en-GB-LibbyNeural" },
  { key: "ryan", engine: "edge", name: "Ryan", gender: "male", locale: "en-GB", accent: "British", id: "en-GB-RyanNeural" },
  { key: "natasha", engine: "edge", name: "Natasha", gender: "female", locale: "en-AU", accent: "Australian", id: "en-AU-NatashaNeural" },
  { key: "william", engine: "edge", name: "William", gender: "male", locale: "en-AU", accent: "Australian", id: "en-AU-WilliamNeural" },
];

/** ElevenLabs premium voices (used when ELEVENLABS_API_KEY is configured). */
export const ELEVEN_VOICES: TtsVoiceDef[] = [
  { key: "rachel", engine: "elevenlabs", name: "Rachel", gender: "female", locale: "en-US", accent: "American", id: "21m00Tcm4TlvDq8ikWAM" },
  { key: "sarah", engine: "elevenlabs", name: "Sarah", gender: "female", locale: "en-US", accent: "American", id: "EXAVITQu4vr4xnSDxMaL" },
  { key: "george", engine: "elevenlabs", name: "George", gender: "male", locale: "en-US", accent: "American", id: "JBFqnCBsd6RMkjVDRZzb" },
  { key: "charlie", engine: "elevenlabs", name: "Charlie", gender: "male", locale: "en-US", accent: "American", id: "IKne3meq5aSn9XLyUdCD" },
  { key: "domi", engine: "elevenlabs", name: "Domi", gender: "female", locale: "en-US", accent: "American", id: "onwK4e9ZLuTAKqWW03F9" },
  { key: "adam", engine: "elevenlabs", name: "Adam", gender: "male", locale: "en-US", accent: "American", id: "pNInz6obpgDQGcFmaJgB" },
];

/** Full voice list offered to the UI (Edge always available; ElevenLabs only when key set). */
export function availableVoices(): TtsVoiceDef[] {
  const hasEleven = Boolean(process.env.ELEVENLABS_API_KEY);
  return [...EDGE_VOICES, ...(hasEleven ? ELEVEN_VOICES : [])];
}

function escapeSSML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Synthesize with Microsoft Edge Read Aloud (free, no key). */
async function synthesizeEdge(
  text: string,
  voiceId: string,
): Promise<SpeechResult | null> {
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(
      voiceId,
      OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3,
    );
    const { audioStream } = tts.toStream(escapeSSML(text), {
      rate: 1.02,
      pitch: "+0Hz",
    });
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        tts.close();
        reject(new Error("edge-tts timeout"));
      }, 25000);
      audioStream.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
      audioStream.on("end", () => {
        clearTimeout(timer);
        resolve();
      });
      audioStream.on("error", (e: Error) => {
        clearTimeout(timer);
        reject(e);
      });
      audioStream.on("close", () => {
        clearTimeout(timer);
        if (chunks.length === 0) {
          reject(new Error("edge-tts closed with no audio"));
        } else {
          resolve();
        }
      });
    });
    tts.close();
    const buf = Buffer.concat(chunks);
    if (!buf.length) return null;
    return { bytes: buf, contentType: "audio/mpeg", engine: "edge" };
  } catch {
    return null;
  }
}

/** Synthesize with ElevenLabs (Flash v2.5 — best quality, low latency). */
async function synthesizeElevenLabs(
  text: string,
  voiceId: string,
): Promise<SpeechResult | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`${ELEVEN_BASE}/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2_5",
        output_format: "mp3_44100_128",
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 },
      }),
    });
    if (!res.ok) return null;
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType:
        res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
      engine: "elevenlabs",
    };
  } catch {
    return null;
  }
}

/** Legacy Groq Orpheus path (kept; only succeeds if your key has Orpheus enabled). */
async function synthesizeGroq(text: string, voice: string): Promise<SpeechResult | null> {
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const res = await fetch(`${GROQ_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "canopylabs/orpheus-v1-english",
        input: text.slice(0, 190),
        voice: voice || "tara",
        response_format: "wav",
      }),
    });
    if (!res.ok) return null;
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type")?.split(";")[0] || "audio/wav",
      engine: "groq",
    };
  } catch {
    return null;
  }
}

/** Legacy LiveKit fishaudio path. */
async function synthesizeLiveKit(text: string): Promise<SpeechResult | null> {
  if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET) return null;
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
        text: text.slice(0, 4000),
      }),
    });
    if (!res.ok) return null;
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type")?.split(";")[0] || "audio/wav",
      engine: "livekit",
    };
  } catch {
    return null;
  }
}

function resolveVoice(voiceKey: string | undefined): {
  engine: "edge" | "elevenlabs" | "groq";
  id: string;
} {
  const key = voiceKey ?? "aria";
  const match =
    EDGE_VOICES.find((v) => v.key === key) ??
    ELEVEN_VOICES.find((v) => v.key === key);
  if (match) return { engine: match.engine, id: match.id };

  // Allow raw engine voice ids (Edge short names) if not a known preset.
  if (/^en-(?:\w{2})-[A-Z]\w+Neural$/.test(key)) return { engine: "edge", id: key };
  return { engine: "edge", id: "en-US-AriaNeural" };
}

/**
 * Synthesizes speech. Engine precedence (respecting the user's picks):
 *   1. ElevenLabs Flash v2.5 — best quality, only if ELEVENLABS_API_KEY is set.
 *   2. Edge TTS — free, no key, unlimited, very natural. Default when no key.
 *   3. Groq Orpheus / LiveKit — legacy fallbacks.
 *   4. null → the client falls back to the browser synthesizer.
 */
export async function synthesizeSpeech(
  text: string,
  options: TtsOptions = {},
): Promise<SpeechResult | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const { engine, id } = resolveVoice(options.voice);
  const forced = process.env.TTS_ENGINE?.toLowerCase();

  // Prefer ElevenLabs when the key exists (unless an engine is forced) and
  // the requested/configured voice is ElevenLabs.
  const wantEleven =
    !forced || forced === "elevenlabs"
      ? Boolean(process.env.ELEVENLABS_API_KEY) && engine === "elevenlabs"
      : false;

  if (wantEleven) {
    const r = await synthesizeElevenLabs(trimmed.slice(0, 4000), id);
    if (r) return r;
  }

  // Edge TTS is the free default — always try it unless Engine is forced to ElevenLabs.
  if (!forced || forced === "edge") {
    const edgeVoice =
      (engine === "elevenlabs" || engine === "groq")
        ? "en-US-AriaNeural"
        : id;
    const r = await synthesizeEdge(trimmed.slice(0, 4000), edgeVoice);
    if (r) return r;
  }

  // Legacy engines (kept for backwards compatibility / when keys are active).
  const g = await synthesizeGroq(trimmed, engine === "groq" ? id : "tara");
  if (g) return g;
  const k = await synthesizeLiveKit(trimmed);
  if (k) return k;

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
  tts: TtsEngine[];
  stt: ("groq" | "browser")[];
} {
  const tts: TtsEngine[] = ["edge"]; // Edge TTS is always available and free.
  if (process.env.ELEVENLABS_API_KEY) tts.push("elevenlabs");
  if (process.env.GROQ_API_KEY) tts.push("groq");
  if (process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET)
    tts.push("livekit");

  return {
    tts,
    stt: [
      ...(process.env.GROQ_API_KEY ? (["groq"] as const) : []),
      "browser",
    ],
  };
}
