import type { ActivityKind } from "@/ai/types";

/**
 * Maps a tool the agent invoked onto the coarse activity the user should be
 * told about. Anything unmapped falls back to "working".
 */
export const ACTIVITY_BY_TOOL: Record<string, ActivityKind> = {
  search_web: "searching",
  open_url: "reading",
  calculate: "calculating",
  recall_memories: "remembering",
  store_memory: "remembering",
  get_time: "working",
  system_info: "working",
};

export function activityForTool(name: string): ActivityKind {
  return ACTIVITY_BY_TOOL[name] ?? "working";
}

/** Short human-readable label for the status line. */
export function activityLabel(activity: ActivityKind): string {
  switch (activity) {
    case "searching":
      return "Searching the web…";
    case "reading":
      return "Reading the page…";
    case "calculating":
      return "Crunching the numbers…";
    case "remembering":
      return "Checking my memory…";
    case "generating":
      return "Generating…";
    case "working":
      return "Working on it…";
    default:
      return "Thinking…";
  }
}

/**
 * Spoken acknowledgements, JARVIS-style: one short clause, never more, so the
 * user hears progress instead of dead air while a turn is being worked out.
 */
const PHRASES: Record<ActivityKind, string[]> = {
  thinking: [
    "Thinking it through.",
    "Let me think about that.",
    "Working on it.",
    "One moment.",
    "Processing that now.",
  ],
  searching: [
    "Searching the web.",
    "Looking that up.",
    "Checking the latest sources.",
    "Scanning for current information.",
  ],
  reading: [
    "Reading that page.",
    "Pulling up the details.",
    "Reviewing the source.",
  ],
  generating: [
    "Putting that together.",
    "Composing my reply.",
    "Almost there.",
  ],
  calculating: ["Running the numbers.", "Crunching that."],
  remembering: [
    "Checking my memory.",
    "Recalling what I know.",
    "Looking through my notes.",
  ],
  working: ["On it.", "Give me a second.", "Working on it."],
};

/** Rotating filler spoken while a turn is being worked out, so it isn't silent. */
const THINKING_FILLERS = [
  "Thinking…",
  "Working through it…",
  "One moment…",
  "Almost there…",
  "Processing…",
  "Just a second…",
  "Hold on…",
  "Getting to it…",
];

/** Deterministic-ish rotation without Math.random, so it stays testable. */
function pick<T>(list: T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length];
}

export function activityPhrase(activity: ActivityKind, index: number): string {
  return pick(PHRASES[activity] ?? PHRASES.working, index);
}

export function thinkingFiller(index: number): string {
  return pick(THINKING_FILLERS, index);
}

/**
 * Barge-in stop words. Saying any of these while Ultron is talking cuts the
 * read-out short and hands the floor back to the user.
 */
const STOP_PHRASES = [
  "stop",
  "stop that",
  "stop talking",
  "stop reading",
  "cancel",
  "never mind",
  "nevermind",
  "shut up",
  "quiet",
  "silence",
  "that's enough",
  "thats enough",
  "enough",
];

export function isStopPhrase(text: string): boolean {
  const clean = text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return false;
  if (STOP_PHRASES.includes(clean)) return true;
  // Accept stop words embedded in a short utterance ("okay stop", "please stop").
  const words = clean.split(" ");
  return words.length <= 3 && STOP_PHRASES.some((p) => p.includes(clean) || clean.includes(p));
}

/**
 * Echo guard for barge-in. The assistant's own read-out can bleed into the
 * microphone, and turning that back into a "new command" would loop forever.
 * If most of the heard words already appear in what was just spoken, we treat
 * it as echo and drop it.
 */
export function looksLikeEcho(spoken: string, heard: string): boolean {
  const heardWords = heard
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (heardWords.length < 2) return false;
  const spokenWords = new Set(
    spoken
      .toLowerCase()
      .replace(/[^a-z'\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean),
  );
  const overlap = heardWords.filter((w) => spokenWords.has(w)).length;
  return overlap / heardWords.length >= 0.5;
}
