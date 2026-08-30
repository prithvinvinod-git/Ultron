"use client";

import React from "react";
import { Mic } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

interface VoiceInputProps {
  /** Controlled listening state from the parent. */
  listening?: boolean;
  /** Elapsed seconds counter shown next to the frequency bars. */
  elapsed?: number;
  className?: string;
  onPressStart?: () => void;
  onPressEnd?: () => void;
}

export function VoiceInput({
  listening = false,
  elapsed = 0,
  className,
  onPressStart,
  onPressEnd,
}: VoiceInputProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Stable pseudo-random heights per bar so no Math.random runs during render.
  const bars = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        a: 4 + ((i * 53) % 9),
        b: 3 + ((i * 29) % 8),
      })),
    [],
  );

  return (
    <div className={cn("flex flex-col items-center justify-center", className)}>
      <motion.div
        className={cn(
          "flex cursor-pointer select-none items-center justify-center rounded-full border p-1.5 transition-colors",
          listening
            ? "border-brand/50 bg-brand/15"
            : "border-border hover:border-border-strong hover:bg-surface-2",
        )}
        layout
        transition={{
          layout: {
            duration: 0.4,
          },
        }}
        onClick={() => (listening ? onPressEnd?.() : onPressStart?.())}
        aria-label={listening ? "Listening… click to stop" : "Click to talk"}
        title={listening ? "Listening… click to stop" : "Click to talk"}
      >
        <div className="flex h-5 w-5 items-center justify-center">
          {listening ? (
            <motion.div
              className="h-3.5 w-3.5 rounded-sm bg-brand"
              animate={{
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
            />
          ) : (
            <Mic className="h-3.5 w-3.5 text-brand-bright" />
          )}
        </div>
        <AnimatePresence mode="wait">
          {listening && (
            <motion.div
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 8 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{
                duration: 0.4,
              }}
              className="flex items-center justify-center gap-2 overflow-hidden"
            >
              {/* Frequency Animation */}
              <div className="flex items-center justify-center gap-0.5">
                {bars.map((bar, i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 rounded-full bg-brand"
                    initial={{ height: 2 }}
                    animate={{
                      height: listening ? [2, bar.a, bar.b, 2] : 2,
                    }}
                    transition={{
                      duration: listening ? 1 : 0.3,
                      repeat: listening ? Infinity : 0,
                      delay: listening ? i * 0.05 : 0,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              {/* Timer */}
              <div className="w-10 text-center text-xs text-mist">
                {formatTime(elapsed)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
