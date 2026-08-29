"use client";

import type { LiveStatus } from "@/app/components/voice/use-live-session";
import { cn } from "@/lib/utils";

export function LiveMode({
  status,
  subtitle,
  onStop,
}: {
  status: LiveStatus;
  subtitle: string;
  onStop: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 pt-2">
      <div className="relative flex h-44 w-44 items-center justify-center">
        {status === "listening" && (
          <>
            <span className="orb-ring-listening absolute inset-0 rounded-full border border-brand/40" />
            <span className="orb-ring-listening absolute inset-0 rounded-full border border-brand/40 [animation-delay:0.9s]" />
          </>
        )}
        {status === "speaking" && (
          <>
            <span className="orb-ring-talk absolute inset-0 rounded-full border border-sigil/50" />
            <span className="orb-ring-talk absolute inset-0 rounded-full border border-sigil/50 [animation-delay:0.45s]" />
            <span className="orb-ring-talk absolute inset-0 rounded-full border border-amber-300/50 [animation-delay:0.9s]" />
          </>
        )}
        {status === "thinking" && (
          <span className="orb-spin absolute inset-3 rounded-full border-2 border-dashed border-brand/60" />
        )}

        <div
          className={cn(
            "orb-core relative z-10 flex h-28 w-28 items-center justify-center rounded-full",
            status === "listening" && "orb-breathe",
            status === "thinking" && "orb-breathe opacity-70",
            status === "speaking" && "orb-pulse",
          )}
        >
          <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,#f0916f_0%,#d97757_55%,#8a5a3a_100%)] blur-[2px]" />
          <div className="absolute inset-[3px] rounded-full bg-[radial-gradient(circle_at_50%_45%,#241f1a_0%,#191512_100%)]" />
          {status === "speaking" && (
            <div className="relative z-10 flex h-9 items-end gap-[3px]">
              {[0, 1, 2, 3, 4].map((i) => (
                <span
                  key={i}
                  className="orb-wave w-[4px] rounded-full bg-sigil"
                  style={{ animationDelay: `${i * 0.12}s`, height: `${14 + (i % 2) * 10}px` }}
                />
              ))}
            </div>
          )}
          {status === "thinking" && (
            <span className="orb-dot relative z-10 h-3 w-3 rounded-full bg-brand" />
          )}
          {status === "listening" && (
            <span className="orb-mic relative z-10 text-brand-bright" aria-hidden>
              <MicGlyph />
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm font-medium text-ink">
          {status === "listening" && "Listening…"}
          {status === "thinking" && "Thinking…"}
          {status === "speaking" && "Speaking…"}
        </p>
        {subtitle && (
          <p className="max-w-md text-xs text-mist">{subtitle}</p>
        )}
        <button
          onClick={onStop}
          className="mt-2 rounded-full border border-bad/40 bg-bad/10 px-4 py-1.5 text-xs text-bad transition hover:bg-bad/20"
        >
          End live session
        </button>
      </div>
    </div>
  );
}

function MicGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}