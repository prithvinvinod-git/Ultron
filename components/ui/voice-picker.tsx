"use client";

import * as React from "react";
import { AudioLines, Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface VoiceOption {
  key: string;
  name: string;
  accent: string;
  engine: string;
  gender: string;
  note?: string;
}

/**
 * Themed voice picker. A native <select> can't show accent, gender or the
 * voice's character, and can't be themed; this replaces it with a themed
 * listbox that does, with full keyboard support.
 *
 * Lives in the Settings tab — the composer no longer carries a picker.
 */
export function VoicePicker({
  voices,
  voiceKey,
  onChange,
  align = "bottom",
  className,
}: {
  voices: VoiceOption[];
  voiceKey?: string;
  onChange?: (key: string) => void;
  align?: "top" | "bottom";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  // null = follow the selected voice; otherwise the keyboard/hover cursor.
  const [cursor, setCursor] = React.useState<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const selectedIndex = Math.max(
    0,
    voices.findIndex((v) => v.key === voiceKey),
  );
  const selected = voices[selectedIndex];
  const index = cursor ?? selectedIndex;

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-voice-index="${index}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [index, open]);

  const commit = (i: number) => {
    const v = voices[i];
    if (!v) return;
    onChange?.(v.key);
    setOpen(false);
    setCursor(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setCursor(null);
        setOpen(true);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((i) => ((i ?? index) + 1) % voices.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((i) => ((i ?? index) - 1 + voices.length) % voices.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(index);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setCursor(null);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setCursor(null);
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select voice"
        title={selected?.note ?? "Select voice"}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-2.5 pr-2 transition-colors",
          open
            ? "border-[#8B5CF6]/60 bg-[#1F2023]"
            : "border-[#2A2C31] bg-[#1F2023]/70 hover:border-[#3A3D44]",
        )}
      >
        <AudioLines className="h-3.5 w-3.5 shrink-0 text-brand-bright" />
        <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-[#D1D5DB]">
          {selected ? `${selected.name} · ${selected.accent}` : "Voice"}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[#8b8d95] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Voices"
          className={cn(
            "absolute z-50 max-h-72 w-64 overflow-y-auto rounded-2xl border border-[#3a3b40] bg-[#242529] py-1 shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
            align === "top" ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          {voices.map((v, i) => (
            <button
              key={v.key}
              type="button"
              role="option"
              aria-selected={v.key === voiceKey}
              data-voice-index={i}
              onMouseEnter={() => setCursor(i)}
              onClick={() => commit(i)}
              className={cn(
                "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                i === index ? "bg-[#8B5CF6]/15" : "hover:bg-white/5",
              )}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-baseline gap-1.5">
                  <span className="truncate text-sm text-[#c9cbd1]">{v.name}</span>
                  <span className="shrink-0 text-[10px] text-[#8b8d95]">
                    {v.accent} · {v.gender}
                  </span>
                </span>
                {v.note && (
                  <span className="line-clamp-1 text-[11px] text-[#8b8d95]">
                    {v.note}
                  </span>
                )}
              </span>
              {v.key === voiceKey && (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-bright" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
