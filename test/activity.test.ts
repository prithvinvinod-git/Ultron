import { describe, expect, it } from "vitest";
import {
  ACTIVITY_BY_TOOL,
  activityForTool,
  activityLabel,
  activitySpokenWord,
  isStopPhrase,
  longWaitLine,
  looksLikeEcho,
} from "@/lib/activity";
import type { ActivityKind } from "@/ai/types";

describe("activityForTool", () => {
  it("maps known tools to their coarse activity", () => {
    expect(activityForTool("search_web")).toBe("searching");
    expect(activityForTool("open_url")).toBe("reading");
    expect(activityForTool("calculate")).toBe("calculating");
    expect(activityForTool("recall_memories")).toBe("remembering");
    expect(activityForTool("store_memory")).toBe("remembering");
  });

  it("falls back to working for unmapped and unknown tools", () => {
    expect(activityForTool("get_time")).toBe("working");
    expect(activityForTool("system_info")).toBe("working");
    expect(activityForTool("some_future_tool")).toBe("working");
  });

  it("every mapped tool resolves to the activity it is mapped to", () => {
    for (const [tool, activity] of Object.entries(ACTIVITY_BY_TOOL)) {
      expect(activityForTool(tool)).toBe(activity);
    }
  });
});

describe("activitySpokenWord", () => {
  it("is a single word, so it cannot stack up into stalling chatter", () => {
    const kinds: ActivityKind[] = [
      "thinking",
      "searching",
      "reading",
      "generating",
      "calculating",
      "remembering",
      "working",
    ];
    for (const kind of kinds) {
      const word = activitySpokenWord(kind);
      expect(word).not.toBe("");
      expect(word.split(" ").length).toBe(1);
    }
  });

  it("returns a word even for an unknown activity", () => {
    expect(activitySpokenWord("nonsense" as ActivityKind)).toBe("Working");
  });
});

describe("activityLabel", () => {
  it("labels every known activity with non-empty text", () => {
    const kinds: ActivityKind[] = [
      "thinking",
      "searching",
      "reading",
      "generating",
      "calculating",
      "remembering",
      "working",
    ];
    for (const kind of kinds) {
      expect(activityLabel(kind).length).toBeGreaterThan(0);
    }
  });

  it("does not crash on an unknown activity", () => {
    expect(activityLabel("nonsense" as ActivityKind)).toBe("Thinking…");
  });
});

describe("longWaitLine", () => {
  it("cycles through the lines instead of hammering one", () => {
    expect(longWaitLine(0)).toBe(longWaitLine(3));
    expect(longWaitLine(1)).not.toBe(longWaitLine(0));
    expect(longWaitLine(2)).not.toBe(longWaitLine(1));
  });

  it("returns a line for every index the caller can produce", () => {
    // The caller counts up from 0. NOTE: a negative index currently returns
    // undefined (`-1 % 3 === -1`). Unreachable today, but see tasks.md — logged
    // as a latent gap rather than patched here, because Step 0 changes no source.
    for (let i = 0; i < 12; i++) {
      expect(longWaitLine(i).length).toBeGreaterThan(0);
    }
  });
});

describe("isStopPhrase", () => {
  it("accepts the canonical stop phrases", () => {
    for (const phrase of ["stop", "stop that", "stop talking", "cancel", "never mind", "quiet"]) {
      expect(isStopPhrase(phrase)).toBe(true);
    }
  });

  it("is case and punctuation insensitive", () => {
    expect(isStopPhrase("STOP")).toBe(true);
    expect(isStopPhrase("  Stop!  ")).toBe(true);
    expect(isStopPhrase("stop.")).toBe(true);
  });

  it("accepts a stop word embedded in a short utterance", () => {
    expect(isStopPhrase("okay stop")).toBe(true);
    expect(isStopPhrase("please stop")).toBe(true);
  });

  it("does not fire on a long sentence that merely contains 'stop'", () => {
    // Guards against cancelling a real command just because one word matched.
    expect(isStopPhrase("stop the music and tell me the weather instead")).toBe(false);
  });

  it("returns false for empty or punctuation-only input", () => {
    expect(isStopPhrase("")).toBe(false);
    expect(isStopPhrase("   ")).toBe(false);
    expect(isStopPhrase("?!.")).toBe(false);
  });
});

describe("looksLikeEcho", () => {
  it("detects the assistant hearing its own read-out", () => {
    expect(looksLikeEcho("The answer is five.", "the answer is five")).toBe(true);
  });

  it("ignores a genuine new command that shares one word", () => {
    expect(looksLikeEcho("The answer is five.", "tomorrow remind me")).toBe(false);
  });

  it("needs at least two substantial words before deciding", () => {
    expect(looksLikeEcho("The answer is five.", "no")).toBe(false);
    expect(looksLikeEcho("The answer is five.", "")).toBe(false);
  });

  it("ignores words of two characters or fewer", () => {
    // "a", "of", "is" are noise for this comparison and must not count as overlap.
    expect(looksLikeEcho("a b c d e f", "a b c d")).toBe(false);
  });

  it("tolerates punctuation and casing differences", () => {
    expect(looksLikeEcho("Checking, reading — done!", "checking reading done")).toBe(true);
  });
});
