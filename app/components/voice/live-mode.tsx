"use client";

import { useEffect, useRef } from "react";
import type { LiveStatus } from "@/app/components/voice/use-live-session";
import { VoicePoweredOrb } from "@/components/ui/voice-powered-orb";
import { activityLabel } from "@/lib/activity";
import type { ActivityKind } from "@/ai/types";
import { cn } from "@/lib/utils";

export interface LiveCaption {
  id: string;
  text: string;
}

export function LiveMode({
  status,
  activity,
  subtitle,
  captions,
  onStop,
}: {
  status: LiveStatus;
  /** What Ultron is doing right now (searching, generating, …). */
  activity?: ActivityKind | null;
  /** Live transcript of what the user is saying. */
  subtitle?: string;
  captions: LiveCaption[];
  onStop: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the teleprompter to the newest caption as it streams in.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [captions, status]);

  const speaking = status === "speaking";
  // Surface the agent's real activity (e.g. "Searching the web…") while it works.
  const statusLine =
    status === "listening"
      ? "Listening…"
      : status === "speaking"
        ? "Speaking…"
        : activity
          ? activityLabel(activity)
          : "Thinking…";

  return (
    <div className="flex h-full min-h-0 flex-col items-center gap-4 px-6 pt-2">
      {/* Voice-sensitive orb */}
      <div
        className={cn(
          "relative h-44 w-44 shrink-0",
          status === "listening" && "animate-breathe",
        )}
      >
        <VoicePoweredOrb
          // The orb animates on its own; we deliberately keep its microphone
          // DISABLED because useLiveSession already owns the live mic (Web
          // Speech / VAD). Having the orb open a second getUserMedia stream
          // caused a race where the mic stayed on after ending live mode.
          enableVoiceControl={false}
          className="h-full w-full overflow-visible"
        />
        {status === "speaking" && (
          <div className="pointer-events-none absolute inset-0 m-auto flex h-10 items-end justify-center gap-[3px]">
            {[0, 1, 2, 3, 4].map((i) => (
              <span
                key={i}
                className="orb-wave w-[4px] rounded-full bg-white/90"
                style={{ animationDelay: `${i * 0.12}s`, height: `${14 + (i % 2) * 10}px` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Status line */}
      <div className="flex min-h-[4.5rem] shrink-0 flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-ink">{statusLine}</p>
        {subtitle ? (
          <p className="max-w-md text-balance text-xs italic text-graphite">
            “{subtitle}”
          </p>
        ) : (
          <p className="text-xs text-mist">
            Say “stop” to cut in, or just talk over me.
          </p>
        )}
        <button
          onClick={onStop}
          className="mt-1 rounded-full border border-bad/40 bg-bad/10 px-4 py-1.5 text-xs text-bad transition hover:bg-bad/20"
        >
          End live session
        </button>
      </div>

      {/* Teleprompter captions — the assistant's output, shown large and auto-scrolling */}
      <div
        ref={scrollRef}
        className="w-full max-w-3xl flex-1 min-h-0 overflow-y-auto scroll-smooth px-2 pb-2"
      >
        <div className="flex flex-col gap-6 py-2">
          {captions.length === 0 ? (
            <p className="pt-6 text-center text-lg text-mist">
              {speaking
                ? "…"
                : "Ask me anything — I'll answer here in large print."}
            </p>
          ) : (
            captions.map((c, i) => {
              const isLast = i === captions.length - 1;
              return (
                <p
                  key={c.id}
                  className={cn(
                    "leading-snug tracking-tight",
                    isLast
                      ? "text-3xl font-semibold text-ink"
                      : "text-xl text-graphite",
                  )}
                >
                  {c.text}
                </p>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
