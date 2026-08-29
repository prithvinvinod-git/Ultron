"use client";

import { Check, Loader2, TriangleAlert, Volume2, X } from "lucide-react";
import { Markdown } from "@/app/components/chat/markdown";
import { cn } from "@/lib/utils";

export interface ToolStepUI {
  toolCallId: string;
  name: string;
  state: "running" | "done" | "error";
  result?: string;
  error?: string;
}

export interface MessageUI {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  toolSteps?: ToolStepUI[];
  provider?: string;
  model?: string;
  streaming?: boolean;
  error?: string;
}

export function MessageBubble({
  message,
  onSpeak,
}: {
  message: MessageUI;
  onSpeak: (text: string) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className="animate-rise flex w-full gap-3">
      {!isUser && (
        <div className="core-gradient mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-[11px] font-bold text-white">
          U
        </div>
      )}

      <div className={cn("flex min-w-0 max-w-full flex-col gap-1", isUser && "ml-auto")}>
        {message.error && (
          <div className="flex items-center gap-2 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
            <TriangleAlert size={15} />
            <span className="min-w-0">{message.error}</span>
          </div>
        )}

        {isUser ? (
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[14.5px] leading-relaxed text-ink">
            {message.text}
          </div>
        ) : (
          <>
            {message.thinking ? (
              <div className="max-w-[85%] rounded-xl bg-surface/80 px-3 py-2 text-xs text-mist">
                <span className="mb-1 flex items-center gap-1.5 font-medium text-graphite">
                  <Loader2 size={12} className="animate-spin" />
                  Thinking
                </span>
                <div className="max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed opacity-80">
                  {message.thinking}
                </div>
              </div>
            ) : null}

            {message.toolSteps?.length ? (
              <div className="flex max-w-[85%] flex-col gap-1">
                {message.toolSteps.map((step, i) => (
                  <div
                    key={`${step.toolCallId}-${i}`}
                    className="flex items-start gap-2 rounded-xl border border-border bg-surface/70 px-3 py-1.5 text-xs"
                    title={step.result ?? step.error}
                  >
                    {step.state === "running" && (
                      <Loader2 size={13} className="mt-0.5 animate-spin text-brand-bright" />
                    )}
                    {step.state === "done" && (
                      <Check size={13} className="mt-0.5 text-good" />
                    )}
                    {step.state === "error" && (
                      <X size={13} className="mt-0.5 text-bad" />
                    )}
                    <span className="min-w-0">
                      <span className="font-medium text-ink">
                        {step.state === "error"
                          ? `${step.name} failed`
                          : step.name.replace(/_/g, " ")}
                      </span>
                      {step.result && step.state === "done" && (
                        <span className="ml-2 line-clamp-2 text-mist">
                          {truncate(step.result, 160)}
                        </span>
                      )}
                      {step.error && (
                        <span className="ml-2 line-clamp-2 text-bad">{step.error}</span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="max-w-[85%]">
              {message.text ? (
                <Markdown>{message.text}</Markdown>
              ) : message.streaming ? (
                <span className="flex items-center gap-1 py-1 text-sm text-mist">
                  <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-brand-bright" />
                  <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-brand-bright [animation-delay:0.2s]" />
                  <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-brand-bright [animation-delay:0.4s]" />
                </span>
              ) : (
                <span className="text-sm text-mist">No response.</span>
              )}
            </div>

            {(message.provider || message.streaming) && (
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-mist">
                {message.streaming ? (
                  <span>streaming…</span>
                ) : (
                  <>
                    <span>
                      {message.provider?.toUpperCase() ?? ""}
                      {message.model ? ` · ${message.model}` : ""}
                    </span>
                    {message.text && (
                      <button
                        onClick={() => onSpeak(message.text)}
                        className="flex items-center gap-1 text-mist transition hover:text-brand-bright"
                        aria-label="Speak response"
                      >
                        <Volume2 size={12} />
                        <span>Listen</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}