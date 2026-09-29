"use client";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";

export function Composer({
  value,
  onValueChange,
  onSend,
  disabled,
  listening,
  voiceEnabled,
  onBeginVoice,
  onEndVoice,
  onToggleLive,
  voices,
  voiceKey,
  onVoiceChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  listening: boolean;
  voiceEnabled: boolean;
  onBeginVoice: () => void;
  onEndVoice: () => void;
  onToggleLive?: () => void;
  voices?: { key: string; name: string; accent: string; engine: string; gender: string; note?: string }[];
  voiceKey?: string;
  onVoiceChange?: (key: string) => void;
}) {
  return (
    <div className="w-full max-w-2xl">
      <PromptInputBox
        value={value}
        onValueChange={onValueChange}
        onSend={(text) => {
          if (text.trim()) onSend(text.trim());
        }}
        isLoading={disabled}
        disabled={disabled}
        listening={listening}
        voiceEnabled={voiceEnabled}
        onBeginVoice={onBeginVoice}
        onEndVoice={onEndVoice}
        onToggleLive={onToggleLive}
        voices={voices}
        voiceKey={voiceKey}
        onVoiceChange={onVoiceChange}
        placeholder="Message Ultron…"
      />
    </div>
  );
}
