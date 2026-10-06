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
  /** Explicit engine selected in Settings. */
  engine?: "edge" | "elevenlabs";
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
  /** Short character description shown in the voice picker. */
  note?: string;
  /**
   * Per-voice prosody. The free Edge endpoint accepts plain text and `<prosody>`
   * only (it rejects `mstts:express-as` and `<break>`), so pacing and pitch are
   * the levers that actually shape the delivery. Verified against the live
   * endpoint — don't add unsupported SSML here.
   */
  prosody?: { rate: number; pitch: string; volume?: string };
}

/**
 * Free, no-API-key voices. Ordered best-first: the newer "Multilingual"
 * generation sounds noticeably more lifelike than the classic Aria/Jenny set,
 * and every entry is tuned for a measured, assistant-like delivery.
 */
export const EDGE_VOICES: TtsVoiceDef[] = [
  // --- Best naturalness: newer multilingual neural models ---
  { key: "jarvis", engine: "edge", name: "Jarvis", gender: "male", locale: "en-US", accent: "American", id: "en-US-AndrewMultilingualNeural", note: "Measured, composed — classic Jarvis", prosody: { rate: 0.98, pitch: "-2Hz", volume: "+0%" } },
  { key: "atlas", engine: "edge", name: "Atlas", gender: "male", locale: "en-US", accent: "American", id: "en-US-BrianMultilingualNeural", note: "Warm, grounded narrator", prosody: { rate: 0.97, pitch: "+0Hz", volume: "+0%" } },
  { key: "ava", engine: "edge", name: "Ava", gender: "female", locale: "en-US", accent: "American", id: "en-US-AvaMultilingualNeural", note: "Bright, articulate assistant", prosody: { rate: 1.0, pitch: "+0Hz", volume: "+0%" } },
  { key: "emma", engine: "edge", name: "Emma", gender: "female", locale: "en-US", accent: "American", id: "en-US-EmmaMultilingualNeural", note: "Calm, natural cadence", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
  { key: "andrewnl", engine: "edge", name: "Andrew", gender: "male", locale: "en-US", accent: "American", id: "en-US-AndrewNeural", note: "Even and understated", prosody: { rate: 0.98, pitch: "-1Hz", volume: "+0%" } },
  { key: "brian", engine: "edge", name: "Brian", gender: "male", locale: "en-US", accent: "American", id: "en-US-BrianNeural", note: "Friendly, unhurried", prosody: { rate: 0.98, pitch: "+0Hz", volume: "+0%" } },

  // --- British ---
  { key: "sonia", engine: "edge", name: "Sonia", gender: "female", locale: "en-GB", accent: "British", id: "en-GB-SoniaNeural", note: "Poised British assistant", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
  { key: "libby", engine: "edge", name: "Libby", gender: "female", locale: "en-GB", accent: "British", id: "en-GB-LibbyNeural", note: "Soft, conversational", prosody: { rate: 0.98, pitch: "+0Hz", volume: "+0%" } },
  { key: "maisie", engine: "edge", name: "Maisie", gender: "female", locale: "en-GB", accent: "British", id: "en-GB-MaisieNeural", note: "Youthful and light", prosody: { rate: 1.0, pitch: "+1Hz", volume: "+0%" } },
  { key: "ryan", engine: "edge", name: "Ryan", gender: "male", locale: "en-GB", accent: "British", id: "en-GB-RyanNeural", note: "Steady, newsroom clarity", prosody: { rate: 0.97, pitch: "-1Hz", volume: "+0%" } },
  { key: "thomas", engine: "edge", name: "Thomas", gender: "male", locale: "en-GB", accent: "British", id: "en-GB-ThomasNeural", note: "Calm and low", prosody: { rate: 0.97, pitch: "-2Hz", volume: "+0%" } },

  // --- Other accents ---
  { key: "natasha", engine: "edge", name: "Natasha", gender: "female", locale: "en-AU", accent: "Australian", id: "en-AU-NatashaNeural", note: "Relaxed, easy-going", prosody: { rate: 1.0, pitch: "+0Hz", volume: "+0%" } },
  { key: "william", engine: "edge", name: "William", gender: "male", locale: "en-AU", accent: "Australian", id: "en-AU-WilliamMultilingualNeural", note: "Casual and clear", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
  { key: "emily", engine: "edge", name: "Emily", gender: "female", locale: "en-IE", accent: "Irish", id: "en-IE-EmilyNeural", note: "Lively and quick", prosody: { rate: 1.0, pitch: "+1Hz", volume: "+0%" } },
  { key: "connor", engine: "edge", name: "Connor", gender: "male", locale: "en-IE", accent: "Irish", id: "en-IE-ConnorNeural", note: "Relaxed, storytelling", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
  { key: "clara", engine: "edge", name: "Clara", gender: "female", locale: "en-CA", accent: "Canadian", id: "en-CA-ClaraNeural", note: "Warm and gentle", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
  { key: "liam", engine: "edge", name: "Liam", gender: "male", locale: "en-CA", accent: "Canadian", id: "en-CA-LiamNeural", note: "Friendly, plain", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },

  // --- Classic set (kept: these keys are already saved in users' browsers) ---
  { key: "aria", engine: "edge", name: "Aria", gender: "female", locale: "en-US", accent: "American", id: "en-US-AriaNeural", note: "Clear and energetic", prosody: { rate: 0.98, pitch: "+1Hz", volume: "+0%" } },
  { key: "jenny", engine: "edge", name: "Jenny", gender: "female", locale: "en-US", accent: "American", id: "en-US-JennyNeural", note: "Neutral and steady", prosody: { rate: 0.98, pitch: "+0Hz", volume: "+0%" } },
  { key: "michelle", engine: "edge", name: "Michelle", gender: "female", locale: "en-US", accent: "American", id: "en-US-MichelleNeural", note: "Soft and measured", prosody: { rate: 0.98, pitch: "+0Hz", volume: "+0%" } },
  { key: "ana", engine: "edge", name: "Ana", gender: "female", locale: "en-US", accent: "American", id: "en-US-AnaNeural", note: "Youthful, quick", prosody: { rate: 1.0, pitch: "+1Hz", volume: "+0%" } },
  { key: "guy", engine: "edge", name: "Guy", gender: "male", locale: "en-US", accent: "American", id: "en-US-GuyNeural", note: "Neutral male", prosody: { rate: 0.98, pitch: "+0Hz", volume: "+0%" } },
  { key: "christopher", engine: "edge", name: "Christopher", gender: "male", locale: "en-US", accent: "American", id: "en-US-ChristopherNeural", note: "Mature male", prosody: { rate: 0.97, pitch: "-1Hz", volume: "+0%" } },
  { key: "eric", engine: "edge", name: "Eric", gender: "male", locale: "en-US", accent: "American", id: "en-US-EricNeural", note: "Brisk male", prosody: { rate: 0.99, pitch: "+0Hz", volume: "+0%" } },
];

/** ElevenLabs premium voices (used when ELEVENLABS_API_KEY is configured). */
export const ELEVEN_VOICES: TtsVoiceDef[] = [
  { key: "rachel", engine: "elevenlabs", name: "Rachel", gender: "female", locale: "en-US", accent: "American", id: "21m00Tcm4TlvDq8ikWAM" },
  { key: "sarah", engine: "elevenlabs", name: "Sarah", gender: "female", locale: "en-US", accent: "American", id: "EXAVITQu4vr4xnSDxMaL" },
  { key: "george", engine: "elevenlabs", name: "George", gender: "male", locale: "en-US", accent: "American", id: "JBFqnCBsd6RMkjVDRZzb" },
  { key: "charlie", engine: "elevenlabs", name: "Charlie", gender: "male", locale: "en-US", accent: "American", id: "IKne3meq5aSn9XLyUdCD" },
  { key: "domi", engine: "elevenlabs", name: "Domi", gender: "female", locale: "en-US", accent: "American", id: "onwK4e9ZLuTAKqWW03F9" },
  { key: "doodle", engine: "elevenlabs", name: "Doodle", gender: "male", locale: "en-US", accent: "Custom", id: "DODLEQrClDo8wCz460ld", note: "Custom ElevenLabs voice" },
  { key: "custom-voice", engine: "elevenlabs", name: "Custom Voice", gender: "male", locale: "en-US", accent: "Custom", id: "IRHApOXLvnW57QJPQH2P", note: "Custom ElevenLabs voice" },
  { key: "ultron", engine: "elevenlabs", name: "Ultron", gender: "male", locale: "en-US", accent: "Custom", id: "cPoqAvGWCPfCfyPMwe4z", note: "Custom ElevenLabs voice" },
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

/** Default delivery when a voice has no tuned prosody of its own. */
const DEFAULT_PROSODY = { rate: 0.99, pitch: "+0Hz", volume: "+0%" };

/** Synthesize with Microsoft Edge Read Aloud (free, no key). */
async function synthesizeEdge(
  text: string,
  voice: TtsVoiceDef,
): Promise<SpeechResult | null> {
  const prosody = voice.prosody ?? DEFAULT_PROSODY;
  try {
    const tts = new MsEdgeTTS();
    // 48 kbps is plenty for speech and halves the bytes/TTFB versus 96 kbps.
    await tts.setMetadata(
      voice.id,
      OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    );
    const { audioStream } = tts.toStream(escapeSSML(text), {
      rate: prosody.rate,
      pitch: prosody.pitch,
      ...(prosody.volume ? { volume: prosody.volume } : {}),
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
function stripAudioTags(text: string): string {
  return text.replace(/\[(?:[^\]]+)\]/g, "").replace(/\s{2,}/g, " ").trim();
}

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
        // Use the expressive model so custom voices keep their intended character.
        model_id: "eleven_v3",
        output_format: "mp3_44100_128",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.85,
          style: 0.65,
          use_speaker_boost: true,
        },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[voice] ElevenLabs synthesis failed", {
        status: res.status,
        voiceId,
        detail: detail.slice(0, 500),
      });
      return null;
    }
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

/** The voice actually used for synthesis, with its prosody attached. */
function resolveVoice(voiceKey: string | undefined): TtsVoiceDef {
  const key = voiceKey ?? "aria";
  const match =
    EDGE_VOICES.find((v) => v.key === key) ??
    ELEVEN_VOICES.find((v) => v.key === key);
  if (match) return match;

  // Allow a raw Edge voice id (e.g. en-US-AvaMultilingualNeural) if not a
  // known preset. Prosody falls back to the tuned defaults.
  if (/^en-(?:\w{2})-[A-Z]\w*Neural$/.test(key)) {
    return {
      key,
      engine: "edge",
      name: key,
      gender: "female",
      locale: "en-US",
      accent: "Custom",
      id: key,
    };
  }
  return EDGE_VOICES[0];
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

  const voice = resolveVoice(options.voice);
  const requestedEngine = options.engine ?? process.env.TTS_ENGINE?.toLowerCase();
  // A selected ElevenLabs voice must not silently fall back to the default Edge
  // voice just because an older saved engine preference still says "edge".
  const forced = voice.engine === "elevenlabs" ? "elevenlabs" : requestedEngine;

  // Prefer ElevenLabs when the key exists and the selected/configured engine is
  // ElevenLabs. This keeps custom voice IDs tied to their actual voice provider.
  const wantEleven =
    (!forced || forced === "elevenlabs") &&
    Boolean(process.env.ELEVENLABS_API_KEY) &&
    (voice.engine === "elevenlabs" || forced === "elevenlabs");

  if (wantEleven) {
    const r = await synthesizeElevenLabs(trimmed.slice(0, 4000), voice.id);
    if (r) return r;
  }

  // Edge TTS is the free default — always try it unless Engine is forced to ElevenLabs.
  if (!forced || forced === "edge") {
    // A non-Edge pick (e.g. a premium voice with no key) still gets spoken, by
    // the best free voice rather than going silent.
    const edgeVoice =
      voice.engine === "elevenlabs" ? EDGE_VOICES[0] : voice;
    const r = await synthesizeEdge(stripAudioTags(trimmed).slice(0, 4000), edgeVoice);
    if (r) return r;
  }

  // Do not silently switch providers after an explicit ElevenLabs selection.
  // That makes a failed custom voice sound like an unrelated female fallback.
  if (forced === "elevenlabs") return null;

  // Legacy engines (kept for backwards compatibility / when keys are active).
  const g = await synthesizeGroq(trimmed, "tara");
  if (g) return g;
  const k = await synthesizeLiveKit(trimmed);
  if (k) return k;

  return null;
}

/**
 * Conditioning text for Whisper. It biases recognition toward the vocabulary
 * this assistant actually deals in (product name, provider names, the stack),
 * which is where a general-purpose model mishears most.
 */
const ASR_PROMPT =
  "Ultron is a voice assistant. Terms: Ultron, Grok, Gemini, OpenRouter, " +
  "Firestore, libSQL, Turso, Vercel, Next.js, TypeScript, Edge TTS, Whisper, " +
  "ElevenLabs, GitHub, Docker, API, SSE, SSE stream, JSON.";

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
  // Greedy decoding: the live path re-runs the same audio repeatedly, and
  // sampling only invents different spellings of the same words.
  form.append("temperature", "0");
  // Whisper conditions on this text, so seeding it with the product/tech
  // vocabulary is what stops "Ultron" and friends coming back mangled.
  form.append("prompt", ASR_PROMPT);

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
