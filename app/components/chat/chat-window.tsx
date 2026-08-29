"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Composer } from "@/app/components/chat/composer";
import {
  MessageBubble,
  type MessageUI,
} from "@/app/components/chat/message-bubble";
import { SuggestionCards } from "@/app/components/chat/suggestion-cards";
import { useVoice } from "@/app/components/voice/use-voice";
import type { ChatEvent } from "@/ai/types";

interface SessionTranscript {
  role: "user" | "assistant";
  content: string;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function ChatWindow() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-mist">
          Loading…
        </div>
      }
    >
      <ChatSession />
    </Suspense>
  );
}

function ChatSession() {
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get("s");
  // Remounting on session change keeps each conversation's state isolated.
  return (
    <ChatRoom
      key={sessionIdFromUrl ?? "__new__"}
      initialSessionId={sessionIdFromUrl}
    />
  );
}

function ChatRoom({ initialSessionId }: { initialSessionId: string | null }) {
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [transcript, setTranscript] = useState<MessageUI[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [hydrating, setHydrating] = useState(initialSessionId !== null);

  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const spokenRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef<string | null>(initialSessionId);

  const { listening, speaking, speak, toggle, cleanupStreams } = useVoice({
    onTranscript: (text) => {
      void submit(text);
    },
    onError: (message) => setError(message),
  });

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Keep an API-ready history synced with the visible transcript.
  useEffect(() => {
    historyRef.current = transcript
      .filter((m) => m.text.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.text }));
  }, [transcript]);

  // Hydrate an existing session's transcript on mount.
  useEffect(() => {
    if (!initialSessionId) return;
    let cancelled = false;
    fetch(`/api/sessions/${initialSessionId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setTranscript(
          (data.messages as SessionTranscript[])
            .filter(Boolean)
            .map((m) => ({
              id: makeId(),
              role: m.role,
              text: m.content || "",
            })),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSessionId]);

  // Cleanup on unmount: stop streaming, silence speech, release the mic.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      cleanupStreams();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, [cleanupStreams]);

  // Auto-speak completed answers when the toggle is on.
  useEffect(() => {
    if (!autoSpeak) return;
    const last = transcript[transcript.length - 1];
    if (
      last?.role === "assistant" &&
      last.text &&
      !last.streaming &&
      !spokenRef.current.has(last.id)
    ) {
      spokenRef.current.add(last.id);
      void speak(last.text);
    }
  }, [transcript, autoSpeak, speak]);

  const applyEvent = useCallback((event: ChatEvent) => {
    const id = activeIdRef.current;
    switch (event.type) {
      case "meta":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, provider: event.provider, model: event.model }
              : m,
          ),
        );
        break;
      case "text":
        setTranscript((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: m.text + event.text } : m)),
        );
        break;
      case "reasoning":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, thinking: (m.thinking ?? "") + event.text }
              : m,
          ),
        );
        break;
      case "tool_start":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  toolSteps: [
                    ...(m.toolSteps ?? []).filter(
                      (s) => s.toolCallId !== event.toolCallId,
                    ),
                    {
                      toolCallId: event.toolCallId,
                      name: event.name,
                      state: "running",
                    },
                  ],
                }
              : m,
          ),
        );
        break;
      case "tool_end":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  toolSteps: (m.toolSteps ?? []).map((s) =>
                    s.toolCallId === event.toolCallId
                      ? { ...s, state: "done", result: event.result }
                      : s,
                  ),
                }
              : m,
          ),
        );
        break;
      case "tool_error":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  toolSteps: (m.toolSteps ?? []).map((s) =>
                    s.toolCallId === event.toolCallId
                      ? { ...s, state: "error", error: event.error }
                      : s,
                  ),
                }
              : m,
          ),
        );
        break;
      case "memory":
        break;
      case "done":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  streaming: false,
                  provider: event.provider,
                  model: event.model,
                  text: event.content ?? m.text,
                }
              : m,
          ),
        );
        setStreaming(false);
        break;
      case "error":
        setTranscript((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, streaming: false, error: event.message } : m,
          ),
        );
        setStreaming(false);
        break;
    }
  }, []);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || streaming) return;
      setError(null);

      // Session id: reuse the active one, or mint a fresh uuid for a new chat.
      const sid = sessionIdRef.current ?? makeId();

      const userMsg: MessageUI = { id: makeId(), role: "user", text };
      const assistantMsg: MessageUI = {
        id: makeId(),
        role: "assistant",
        text: "",
        streaming: true,
      };
      activeIdRef.current = assistantMsg.id;
      if (!sessionIdRef.current) setSessionId(sid);
      setHydrating(false);
      setTranscript((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);

      const sendHistory = historyRef.current;
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: sid,
            messages: [...sendHistory, { role: "user", content: text }],
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.error ?? `Request failed (${res.status}).`);
        }
        if (!res.body) throw new Error("No response stream.");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep = buffer.indexOf("\n\n");
          while (sep >= 0) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data: ")) continue;
              try {
                const event = JSON.parse(line.slice(6)) as ChatEvent;
                applyEvent(event);
              } catch {
                // ignore malformed frames
              }
            }
            sep = buffer.indexOf("\n\n");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        applyEvent({ type: "error", message });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, applyEvent],
  );

  const onDoneSpeak = useCallback(
    async (text: string) => {
      if (text.trim()) await speak(text);
    },
    [speak],
  );

  const showSuggestions =
    transcript.length === 0 && !streaming && !error && !hydrating;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(600px 300px at 15% -10%, rgba(124,107,246,0.18), transparent 60%), radial-gradient(700px 320px at 95% 0%, rgba(34,211,238,0.12), transparent 60%)",
        }}
      />

      <header className="pointer-events-none relative z-10 flex items-center justify-between px-6 pt-5 pb-2">
        <div className="text-sm text-mist">
          {autoSpeak && speaking ? (
            <span className="flex items-center gap-2 text-sigil">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-sigil" />
              Speaking…
            </span>
          ) : (
            <span>Ultron ready.</span>
          )}
        </div>
        {listening && <div className="text-xs text-bad">Listening… click mic to stop</div>}
      </header>

      <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-5 pt-4">
          {showSuggestions && (
            <div className="animate-rise mb-4 flex flex-col items-start gap-2 pt-6">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">
                Good to see you.
              </h1>
              <p className="text-sm text-graphite">
                Chat with tools, memory, and voice. Try one of these:
              </p>
              <div className="mt-2">
                <SuggestionCards
                  visible
                  onPick={(prompt) => void submit(prompt)}
                />
              </div>
            </div>
          )}

          {transcript.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSpeak={(text) => void onDoneSpeak(text)}
            />
          ))}

          {error && (
            <div className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pb-5">
        <Composer
          onSend={(text) => void submit(text)}
          disabled={streaming}
          listening={listening}
          speaking={speaking}
          voiceEnabled
          onToggleVoice={() => toggle()}
          onToggleSpeak={() => setAutoSpeak((v) => !v)}
        />
        <p className="mt-2 text-center text-[11px] text-mist">
          Agentive · local memory · Grok / Gemini · voice
        </p>
      </div>
    </div>
  );
}