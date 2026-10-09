"use client";

import { AlertTriangle, Loader2, Mic, Sparkles, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrbState } from "@/lib/floating-orb-state";

type FloatingAiOrbProps = {
  active: boolean;
  state: OrbState;
  onActivate: () => void;
  caption?: string;
};

export function FloatingAiOrb({
  active,
  state,
  onActivate,
  caption,
}: FloatingAiOrbProps) {
  const stateStyles = {
    idle: {
      bg: "bg-gradient-to-b from-slate-700 to-slate-900",
      ring: "ring-slate-500/20",
      glow: "shadow-[0_0_20px_rgba(100,116,139,0.3)]",
      icon: "text-slate-200",
    },
    listening: {
      bg: "bg-gradient-to-b from-cyan-500 to-blue-600",
      ring: "ring-cyan-400/30",
      glow: "shadow-[0_0_24px_rgba(34,211,238,0.4)]",
      icon: "text-white",
    },
    thinking: {
      bg: "bg-gradient-to-b from-violet-500 to-indigo-600",
      ring: "ring-violet-400/30",
      glow: "shadow-[0_0_24px_rgba(139,92,246,0.4)]",
      icon: "text-white",
    },
    speaking: {
      bg: "bg-gradient-to-b from-emerald-500 to-teal-600",
      ring: "ring-emerald-400/30",
      glow: "shadow-[0_0_24px_rgba(16,185,129,0.4)]",
      icon: "text-white",
    },
    error: {
      bg: "bg-gradient-to-b from-red-500 to-red-700",
      ring: "ring-red-400/30",
      glow: "shadow-[0_0_24px_rgba(239,68,68,0.4)]",
      icon: "text-white",
    },
  };

  const style = stateStyles[state];

  const label =
    state === "listening"
      ? "Listening"
      : state === "thinking"
        ? "Thinking"
        : state === "speaking"
          ? "Speaking"
          : state === "error"
            ? "Error"
            : "Ready";

  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-6 right-6 z-40 transition-all duration-300",
        active ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <button
        type="button"
        aria-label={label}
        onClick={onActivate}
        className={cn(
          "relative flex h-14 w-14 items-center justify-center rounded-full border border-white/20 transition-all duration-200 hover:scale-110 active:scale-95",
          style.bg,
          style.ring,
          "ring-1",
          style.glow,
          "backdrop-blur-md",
        )}
      >
        {/* Shimmer gradient overlay */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-white/30 via-transparent to-transparent opacity-40" />

        {/* Animated pulse ring for listening/speaking */}
        {(state === "listening" || state === "speaking") && (
          <div className="absolute inset-0 rounded-full border border-white/40 animate-pulse" />
        )}

        {/* Animated spinner for thinking */}
        {state === "thinking" && (
          <div className="absolute inset-1 rounded-full border-2 border-transparent border-t-white/80 border-r-white/80 animate-spin" />
        )}

        {/* Icon */}
        <span className={cn("relative z-10 flex items-center justify-center", style.icon)}>
          {state === "thinking" && <Loader2 className="h-6 w-6 animate-spin" />}
          {state === "speaking" && <Volume2 className="h-6 w-6" />}
          {state === "listening" && <Mic className="h-6 w-6" />}
          {state === "error" && <AlertTriangle className="h-6 w-6" />}
          {state === "idle" && <Sparkles className="h-6 w-6" />}
        </span>

        {/* Tooltip label */}
        <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950/90 px-2 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity delay-200 group-hover:opacity-100">
          {label}
        </div>
      </button>

      {/* Status caption */}
      {caption && (
        <div className="pointer-events-none absolute -top-8 right-0 rounded-lg bg-slate-950/80 px-3 py-1 text-xs text-slate-200 shadow-lg backdrop-blur-sm border border-slate-700/50">
          {caption}
        </div>
      )}
    </div>
  );
}
