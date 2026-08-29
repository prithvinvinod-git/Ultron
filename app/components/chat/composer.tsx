"use client";

import { PromptInputBox } from "@/components/ui/ai-prompt-box";

export function Composer({
  value,
  onValueChange,
  onSend,
  disabled,
  listening,
  speaking,
  voiceEnabled,
  onBeginVoice,
  onEndVoice,
  onToggleSpeak,
  onToggleLive,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (text: string) => void;
  disabled?: boolean;
  listening: boolean;
  speaking: boolean;
  voiceEnabled: boolean;
  onBeginVoice: () => void;
  onEndVoice: () => void;
  onToggleSpeak: () => void;
  onToggleLive?: () => void;
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
        speaking={speaking}
        voiceEnabled={voiceEnabled}
        onBeginVoice={onBeginVoice}
        onEndVoice={onEndVoice}
        onToggleSpeak={onToggleSpeak}
        onToggleLive={onToggleLive}
        placeholder="Message Ultron…"
      />
    </div>
  );
}
