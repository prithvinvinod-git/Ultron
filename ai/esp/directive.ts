/**
 * ULTRON -> ESP32 DEVICE LINK
 * ----------------------------
 * Turns a finished assistant reply into the physical directives the device
 * understands: which face to make, which servo animation to play, and what to
 * speak out loud.
 *
 * Design notes:
 * - No extra LLM call. A device turn is already the slowest thing in the loop,
 *   and a second round-trip just to pick an eyebrow shape is not worth it.
 *   This is a deterministic, free, sub-millisecond classifier.
 * - Server-side so the firmware stays dumb: it validates names against a
 *   whitelist and never has to guess.
 * - `voice: false` is used for the OLED text (the device has a real scrolling
 *   text area), and `toSpokenText()` produces the short, markdown-free version
 *   that gets synthesised. One agent call, two audiences.
 *
 * ADDITIVE: nothing here is imported by the existing web app.
 */

import type { EspFaceState, EspMotion } from "./protocol";

/** Weighted keyword cues. First match wins, so order is priority order. */
const EMOTION_CUES: Array<{ emotion: EspFaceState; re: RegExp }> = [
  {
    emotion: "angry",
    re: /\b(angry|furious|annoyed|irritat\w*|frustrat\w*|ridiculous|unacceptable|outrage\w*|damn|wtf|hate)\b/i,
  },
  {
    emotion: "sad",
    re: /\b(sad|unhapp\w*|sorry|apolog\w*|regret\w*|disappoint\w*|lost|miss\w* you|grief|tragic)\b/i,
  },
  {
    emotion: "excited",
    re: /\b(excited|awesome|amazing|incredible|fantastic|great news|congrat\w*|brilliant|love it|let'?s go)\b/i,
  },
  {
    emotion: "happy",
    re: /\b(happy|glad|pleased|perfect|excellent|done|finished|works|working|success\w*|nice)\b/i,
  },
  {
    emotion: "surprised",
    re: /\b(wow|whoa|surpris\w*|unexpected|actually|turns out|hold on|wait)\b/i,
  },
  {
    emotion: "confused",
    re: /\b(confus\w*|unsure|not sure|ambiguous|unclear|which one|do you mean|clarif\w*|hmm)\b/i,
  },
];

/** Picks the face for a reply. Deterministic, cheap, and always whitelisted. */
export function inferEmotion(text: string): EspFaceState {
  const t = text.slice(0, 600);
  for (const cue of EMOTION_CUES) {
    if (cue.re.test(t)) return cue.emotion;
  }
  return "idle";
}

/**
 * Motion is choreographed off the emotion plus a little bit of shape, so the
 * head movement agrees with the face instead of fighting it.
 */
export function inferMotion(emotion: EspFaceState, text: string): EspMotion {
  const t = text.toLowerCase();

  // Direct asks override the mood so the user always gets what they asked for.
  if (/\b(listen|look at me|over here|pay attention)\b/.test(t)) return "center";
  if (/\b(tilt|lean)\b/.test(t)) return "tilt_left";
  if (/\b(left|port)\b/.test(t) && emotion !== "angry") return "look_left";
  if (/\b(right|starboard)\b/.test(t) && emotion !== "angry") return "look_right";

  switch (emotion) {
    case "happy":
      return "nod";
    case "excited":
      return "excited";
    case "sad":
      return "nod";
    case "angry":
      return "tilt_right";
    case "confused":
      return "confused";
    case "surprised":
      return "look_left";
    case "thinking":
      return "thinking";
    case "sleeping":
      return "sleep";
    default:
      return "nod";
  }
}

/** Strips markdown and collapses whitespace so it reads cleanly on a 128x64. */
function toPlainText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\b(\d+)\s*%/g, "$1 percent"],
  [/\b(\d+)\s*°\s*C\b/gi, "$1 degrees celsius"],
  [/\b(\d+)\s*°\s*F\b/gi, "$1 degrees fahrenheit"],
  [/\b(\d+)\s*(ms|s|sec|secs|seconds|min|mins|minutes|hr|hrs|hours)\b/gi, "$1 $2"],
  [/\b(\d+)\s*(KB|MB|GB|TB|KiB|MiB|GiB)\b/g, "$1 $2"],
  [/\bvs\.?\b/gi, "versus"],
  [/\be\.g\.?\b/gi, "for example"],
  [/\bi\.e\.?\b/gi, "that is"],
  [/\betc\.?\b/gi, "et cetera"],
  [/\b&\b/g, " and "],
  [/\bhttps?:\/\/\S+/g, "the link in the chat"],
];

/**
 * The spoken version of a reply. The device screen is small and the speaker is
 * one 3W mono driver, so this keeps the first one or two sentences, reads
 * symbols out loud, and never ships markdown to a TTS engine.
 */
export function toSpokenText(text: string, maxChars = 480): string {
  let spoken = toPlainText(text).replace(/\n+/g, " ").trim();
  for (const [re, replacement] of ABBREVIATIONS) {
    spoken = spoken.replace(re, replacement);
  }
  spoken = spoken.replace(/\s{2,}/g, " ").trim();

  // Prefer whole sentences; fall back to a hard cut if there are none.
  const sentences = spoken.match(/[^.!?]+[.!?]*/g);
  if (sentences && sentences.length) {
    let out = "";
    for (const s of sentences) {
      if (out && (out + " " + s).length > maxChars) break;
      out = out ? `${out} ${s.trim()}` : s.trim();
      if (out.length >= maxChars) break;
    }
    if (out.trim().length >= 8) return out.trim().slice(0, maxChars);
  }

  if (spoken.length <= maxChars) return spoken;
  const cut = spoken.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}.`;
}

/** Clamps an arbitrary assistant string to something the device can render. */
export function toDisplayText(text: string, maxChars = 900): string {
  const plain = toPlainText(text);
  if (plain.length <= maxChars) return plain;
  return `${plain.slice(0, maxChars).trimEnd()}…`;
}