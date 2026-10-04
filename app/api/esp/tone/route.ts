/**
 * ULTRON -> ESP32 DEVICE LINK — device UI sound effects.
 *
 * GET /api/esp/tone?name=startup|idle_normal|idle_happy|...&token=...
 *
 * Why tones come from the server instead of the firmware: the MAX98357A is
 * driven by the I2S peripheral, and ESP32-audioI2S already owns that
 * peripheral for MP3 TTS. Bit-banging DIN (the old `ULTRON_AUDIO_TONE` path)
 * produced noise, not tones, and fighting the library for the bus is not worth
 * it. Synthesising a small WAV here and pushing it through the same
 * `connecttohost` path as TTS reuses proven, non-blocking playback.
 *
 * Must return an explicit Content-Length, never a ReadableStream. A stream
 * makes Vercel reply with `Transfer-Encoding: chunked`, which the device's
 * audio library does not de-chunk - the chunk-size lines get decoded as audio
 * and the speaker emits garbage.
 *
 * ADDITIVE route. /api/esp/tts and /api/voice/tts are unchanged.
 */

import { jsonError } from "@/lib/http";
import { checkDeviceToken } from "@/ai/esp/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_RATE = 24000;
const MAX_SECONDS = 6;

type Render = (t: number, i: number) => number;

/** Clamp a 0..1 progress value into a smooth attack/decay envelope. */
function env(p: number, attack: number, release: number, sustain = 1): number {
  if (p < attack) return sustain === 0 ? p / attack : (p / attack) * sustain;
  if (p > 1 - release) return Math.max(0, (1 - p) / release) * sustain;
  return sustain;
}

/** Band-limited-ish sawtooth: sum of harmonics, falling 1/n amplitude. */
function saw(phase: number, harmonics: number): number {
  let v = 0;
  for (let h = 1; h <= harmonics; h++) {
    v += Math.sin(phase * h) / h;
  }
  return v * 0.6;
}

function noise(): number {
  return Math.random() * 2 - 1;
}

function sine(freq: number, durMs: number, gain = 1, decay = 3): Render {
  const dur = durMs / 1000;
  const w = (2 * Math.PI * freq) / SAMPLE_RATE;
  return (t) => {
    const p = t / dur;
    if (p > 1) return 0;
    const attack = Math.min(0.05, 0.01 * dur);
    const e = env(p, attack / dur, Math.min(0.6, 2 / dur));
    return Math.sin(w * t * SAMPLE_RATE) * gain * e * Math.exp(-decay * p);
  };
}

/** Two-note motif, used for the toggle / confirm feedback. */
function motif(f1: number, f2: number, noteMs: number, gain = 0.5): Render {
  const dur = (noteMs * 2) / 1000;
  const w1 = (2 * Math.PI * f1) / SAMPLE_RATE;
  const w2 = (2 * Math.PI * f2) / SAMPLE_RATE;
  return (t) => {
    if (t >= dur) return 0;
    const isSecond = t >= noteMs / 1000;
    const local = isSecond ? t - noteMs / 1000 : t;
    const w = isSecond ? w2 : w1;
    const e = Math.exp(-4 * (local / (noteMs / 1000)));
    return Math.sin(w * t * SAMPLE_RATE) * gain * e;
  };
}

const TONES: Record<string, { durationMs: number; render: Render }> = {
  // --- UI feedback ---------------------------------------------------------
  ok: { durationMs: 90, render: sine(880, 90, 0.45, 4) },
  error: { durationMs: 260, render: sine(190, 260, 0.5, 3) },
  toggle_on: { durationMs: 200, render: motif(620, 1040, 100, 0.45) },
  toggle_off: { durationMs: 200, render: motif(1040, 520, 100, 0.45) },

  // --- Idle voice per face -------------------------------------------------
  idle_normal: { durationMs: 240, render: sine(210, 240, 0.3, 5) },
  idle_happy: { durationMs: 230, render: motif(523, 784, 110, 0.34) },
  idle_question: {
    durationMs: 300,
    render: (t) => {
      const notes = [440, 587, 698];
      const idx = Math.min(2, Math.floor(t / 0.09));
      const local = t - idx * 0.09;
      return Math.sin((2 * Math.PI * notes[idx] * t) / 1) * 0.3 * Math.exp(-6 * local);
    },
  },
  idle_sleep: {
    durationMs: 800,
    render: (t) => {
      const dur = 0.8;
      const p = t / dur;
      // descending sigh
      const freq = 260 * Math.pow(0.45, p);
      const phase = 2 * Math.PI * freq * t;
      return saw(phase, 3) * 0.22 * env(p, 0.15, 0.55) * (1 - p * 0.3);
    },
  },

  /**
   * Drone-like startup: a low rotor tone that spins up, sweeps, and settles.
   * Layers an exponential pitch sweep, harmonic saw stack, ~28 Hz rotor
   * beat, vibrato, and a breath of filtered noise for the whirr texture.
   */
  startup: {
    durationMs: 3000,
    render: (t) => {
      const dur = 3.0;
      const p = t / dur;

      // spin-up: 55 Hz -> 185 Hz, fast then levelling off
      const freq = 55 + 130 * Math.pow(p, 0.55);
      const phase = (2 * Math.PI * freq * t) ;

      // vibrato grows with the sweep, like a rotor blade loading up
      const vib = Math.sin(2 * Math.PI * 5.5 * t) * 0.035 * (1 - p);
      const vphase = phase * (1 + vib);

      const rotor = 0.82 + 0.18 * Math.sin(2 * Math.PI * 28 * t);
      const body = saw(vphase, 8);
      const whine = Math.sin(phase * 4.02) * 0.12 * p;

      // air / whirr
      const air = noise() * 0.05 * p * (1 - p) * 4;

      const e = env(p, 0.06, 0.42, 1);
      return (body * 0.5 + whine + air) * rotor * e * 0.6;
    },
  },
};

function renderTone(spec: { durationMs: number; render: Render }): Float32Array {
  const n = Math.floor((spec.durationMs / 1000) * SAMPLE_RATE);
  const out = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = spec.render(i / SAMPLE_RATE, i);
    out[i] = v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  // Normalise so every effect sits at a predictable, non-clipping level.
  if (peak > 0) {
    const k = 0.82 / peak;
    for (let i = 0; i < n; i++) out[i] *= k;
  }
  return out;
}

function makeWav(samples: Float32Array): Uint8Array {
  const dataLen = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  view.setUint32(40, dataLen, true);

  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, Math.round(v * 32767), true);
    off += 2;
  }
  return new Uint8Array(buf);
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  const auth = checkDeviceToken(url.searchParams.get("token"));
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const name = (url.searchParams.get("name") ?? "").trim();
  const spec = TONES[name];
  if (!spec) {
    return jsonError(404, "unknown tone", { available: Object.keys(TONES) });
  }
  if (spec.durationMs / 1000 > MAX_SECONDS) {
    return jsonError(500, "tone too long");
  }

  const wav = makeWav(renderTone(spec));

  return new Response(wav.buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.byteLength),
      "Cache-Control": "public, max-age=86400",
      "X-Audio-Format": "wav",
      "X-Audio-Sample-Rate": String(SAMPLE_RATE),
      "X-Audio-Length": String(wav.byteLength),
      "X-Tone-Name": name,
    },
  });
}