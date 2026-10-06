"use client";

import { BrainCog, Square, TriangleAlert, Volume2 } from "lucide-react";
import { Markdown } from "@/app/components/chat/markdown";
import { cn } from "@/lib/utils";
import { ThinkingState, type TraceNode } from "@/components/ui/ai-agent-response";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

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
  isSpeaking,
}: {
  message: MessageUI;
  onSpeak: (id: string, text: string) => void;
  isSpeaking?: boolean;
}) {
  const isUser = message.role === "user";

  const hasThinking = !!message.thinking;
  const hasTools = (message.toolSteps?.length ?? 0) > 0;
  const timeline = buildTimeline(message);
  // Pure-reasoning phase (no tools yet): a compact orb + the raw reasoning text.
  const showOrbBox = message.streaming && hasThinking && !hasTools;
  // Agent tool-timeline — live while streaming (web search / tool calls / tasks),
  // settled once the message finishes.
  const showTimeline =
    !!timeline && (!message.streaming || hasTools);

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
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-3 px-4 py-2.5 text-[13.5px] leading-relaxed text-ink">
            {message.text}
          </div>
        ) : (
          <>
            {/* Pure-reasoning streaming phase (no tools yet): animated orb + thinking text */}
            {showOrbBox ? (
              <div className="max-w-[85%] rounded-xl bg-surface/80 px-3 py-2 text-xs text-mist">
                <span className="mb-1 flex items-center gap-2 font-medium text-graphite">
                  <ThinkingOrb state="composing" size={20} theme="dark" />
                  Thinking
                </span>
                <div className="max-h-28 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed opacity-80">
                  {message.thinking}
                </div>
              </div>
            ) : null}

            {/* Agent tool-timeline — live while streaming (tools/searching), settled after done */}
            {showTimeline && timeline ? (
              <div className="max-w-[85%]">
                <ThinkingState
                  nodes={timeline}
                  autoPlay={false}
                  // The nodes are real trace events, so don't animate through
                  // them — but time the turn for real instead of spinning.
                  live={message.streaming}
                  defaultExpanded={message.streaming}
                  workingLabel="Working..."
                />
              </div>
            ) : null}

            <div className="max-w-[85%]">
              {message.text ? (
                <Markdown>{message.text}</Markdown>
              ) : message.streaming ? (
                // While streaming, the thinking orbs are the live "working" indicator
                // (used in both chat and hands-free live mode). Hidden when a thinking
                // box or tool timeline is already communicating progress.
                !showOrbBox && !showTimeline ? (
                  <span className="flex items-center gap-2 py-1 text-sm text-graphite">
                    <ThinkingOrb state="working" size={20} theme="dark" />
                    Working
                  </span>
                ) : null
              ) : (
                <span className="text-sm text-mist">No response.</span>
              )}
            </div>

            {(message.provider || message.streaming) && (
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-mist">
                {message.streaming ? (
                  <span>
                    {message.provider?.toUpperCase() ?? ""}
                    {message.model ? ` · ${message.model}` : ""}
                  </span>
                ) : (
                  <>
                    <span>
                      {message.provider?.toUpperCase() ?? ""}
                      {message.model ? ` · ${message.model}` : ""}
                    </span>
                    {message.text && (
                      <button
                        onClick={() => onSpeak(message.id, message.text)}
                        className={cn(
                          "flex items-center gap-1 transition",
                          isSpeaking
                            ? "text-brand-bright"
                            : "text-mist hover:text-brand-bright",
                        )}
                        aria-label={isSpeaking ? "Stop speaking" : "Speak response"}
                      >
                        {isSpeaking ? (
                          <Square size={12} />
                        ) : (
                          <Volume2 size={12} />
                        )}
                        <span>{isSpeaking ? "Stop" : "Listen"}</span>
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

function buildTimeline(message: MessageUI): TraceNode[] | null {
  const nodes: TraceNode[] = [];

  if (message.thinking) {
    nodes.push({
      type: "reasoning",
      sentences: splitSentences(message.thinking, 6),
      durationSeconds: Math.max(1, Math.round(message.thinking.length / 90)),
    });
  }

  for (const step of message.toolSteps ?? []) {
    const { state, name, result, error } = step;
    const looksLikeCommand =
      name === "execute_command" ||
      /(^|\s)((npm|yarn|npx|pnpm|tsc|node|git|kubectl|python|curl)\s)/.test(name);
    const isSearch = name === "search_web" || /search|web|lookup|query/.test(name);
    const isMemory = name === "recall_memories" || name === "store_memory" || /memor/.test(name);

    // A task/step that failed — show as a failed tool node regardless of kind.
    if (state === "error") {
      nodes.push({
        type: "tool",
        toolName: name,
        status: "failed",
        primary: name.replace(/_/g, " "),
        secondary: truncate(error ?? "failed", 60),
        details: error ? [{ text: error, tone: "error" }] : undefined,
      });
      continue;
    }

    // Terminal / shell command execution.
    if (looksLikeCommand) {
      nodes.push({
        type: "terminal",
        status: state === "running" ? "running" : "completed",
        command: name.replace(/^execute_command\s*/, ""),
        exitCode: 0,
        output: result,
        details: result
          ? [
              { text: `command: ${name.replace(/^execute_command\s*/, "")}`, tone: "muted" },
              ...(result ? [{ text: truncate(result, 400), tone: "ctx" as const }] : []),
            ]
          : undefined,
      });
      continue;
    }

    // Agentic web search.
    if (isSearch) {
      nodes.push({
        type: "search",
        toolName: "search_web",
        status: state === "running" ? "running" : state === "done" ? "completed" : "completed",
        primary: "Web search",
        secondary:
          state === "running"
            ? "Searching the web…"
            : state === "done" && result
            ? truncate(result, 64)
            : "Search completed",
        details:
          state === "done" && result
            ? result
                .split("\n")
                .filter((l) => l.trim().length > 0)
                .slice(0, 6)
                .map((line) => ({ text: truncate(line, 160), tone: "ctx" as const }))
            : undefined,
      });
      continue;
    }

    // Memory recall / store.
    if (isMemory) {
      const isRecall = name === "recall_memories";
      nodes.push({
        type: "tool",
        toolName: name,
        icon: BrainCog,
        status: state === "running" ? "running" : "completed",
        primary: isRecall ? "Recalling memories" : "Saving memory",
        secondary:
          state === "running"
            ? "Working…"
            : state === "done" && result
            ? truncate(result, 60)
            : "Done",
        details:
          state === "done" && result
            ? result
                .split("\n")
                .filter((l) => l.trim().length > 0)
                .slice(0, 5)
                .map((line) => ({ text: truncate(line, 140), tone: "ctx" as const }))
            : undefined,
      });
      continue;
    }

    // Generic utility / tool call (time, calculate, system info, etc.).
    nodes.push({
      type: "tool",
      toolName: name,
      status: state === "running" ? "running" : "completed",
      primary: name.replace(/_/g, " "),
      secondary:
        state === "running"
          ? "running…"
          : state === "done" && result
          ? truncate(result, 60)
          : "completed",
      details:
        state === "done" && result
          ? result
              .split("\n")
              .filter((l) => l.trim().length > 0)
              .slice(0, 8)
              .map((line) => ({
                text: truncate(line, 140),
                tone: "ctx" as const,
              }))
          : undefined,
    });
  }

  return nodes.length > 0 ? nodes : null;
}

function splitSentences(text: string, max: number): string[] {
  const lines = text
    .split(/\n+|\\.\\s+|(?<=[.!?])\\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, max);
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
