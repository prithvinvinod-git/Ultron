"use client";

import { useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Radio, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Composer({
  onSend,
  disabled,
  listening,
  speaking,
  voiceEnabled,
  onToggleVoice,
  onToggleSpeak,
  live,
  onToggleLive,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  listening: boolean;
  speaking: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onToggleSpeak: () => void;
  live?: boolean;
  onToggleLive?: () => void;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const grow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  return (
    <div className="w-full max-w-2xl">
      <div
        className={cn(
          "glass flex items-end gap-1.5 rounded-3xl bg-surface/70 px-2.5 py-2 transition",
          listening && "glow-ring ring-2 ring-bad/40",
          !disabled && "focus-within:glow-ring",
        )}
      >
        {voiceEnabled && (
          <button
            onClick={onToggleVoice}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
              listening
                ? "bg-bad/20 text-bad"
                : "text-mist hover:bg-surface-2 hover:text-ink",
            )}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Listening… click to stop" : "Push to talk"}
          >
            {listening ? (
              <MicOff size={17} className="animate-breathe" />
            ) : (
              <Mic size={17} />
            )}
          </button>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            grow();
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Message Ultron…"
          className="max-h-[140px] min-h-[36px] flex-1 resize-none bg-transparent px-2 py-2 text-[14.5px] leading-relaxed text-ink outline-none placeholder:text-mist"
        />

        <button
          onClick={onToggleSpeak}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
            speaking
              ? "bg-brand/20 text-brand-bright"
              : "text-mist hover:bg-surface-2 hover:text-ink",
          )}
          aria-label="Toggle spoken replies"
          title="Spoken replies (on/off)"
        >
          <Volume2 size={17} />
        </button>

        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className={cn(
            "core-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-lg shadow-brand/30 transition",
            disabled || !value.trim()
              ? "cursor-not-allowed opacity-40 shadow-none"
              : "hover:brightness-110 active:scale-95",
          )}
          aria-label="Send"
        >
          <ArrowUp size={17} />
        </button>
      </div>

      {live === false && onToggleLive && (
        <button
          onClick={onToggleLive}
          className="mx-auto mt-2 flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-3 py-1 text-[11px] text-brand-bright transition hover:bg-brand/20"
        >
          <Radio size={12} className="animate-breathe text-sigil" />
          Live voice
        </button>
      )}
    </div>
  );
}