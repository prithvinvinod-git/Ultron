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
import { useLiveSession } from "@/app/components/voice/use-live-session";
import { LiveMode } from "@/app/components/voice/live-mode";
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
  const [hydrating, setHydrating] = useState(initialSessionId !== null);
  const [live, setLive] = useState(false);
  const [draft, setDraft] = useState("");
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voices, setVoices] = useState<
    { key: string; name: string; accent: string; engine: string; gender: string }[]
  >([]);

  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const activeTextRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(initialSessionId);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);

  const { listening, speaking, speak, begin, end, stopSpeaking, cleanupStreams, voiceKey, setVoiceKey } =
    useVoice({
      onTranscript: (text) => setDraft(text),
      onError: (message) => setError(message),
    });

  // Load the available TTS voices once so the composer can offer a voice picker.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { voices?: typeof voices } | null) => {
        if (!cancelled && data?.voices) setVoices(data.voices);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Toggle TTS for a given assistant message: play it, or stop if already
  // speaking. Keeps the composer speaker button in sync via `speaking`.
  const onSpeakMessage = useCallback(
    (id: string, text: string) => {
      if (speaking) {
        stopSpeaking();
        setSpeakingId(null);
      } else if (text.trim()) {
        setSpeakingId(id);
        void speak(text);
      }
    },
    [speaking, speak, stopSpeaking],
  );

  // Auto-scroll to the latest content, but only while the user is already at
  // the bottom. If the user scrolls up, stop following until they return.
  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

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
        activeTextRef.current = event.content ?? activeTextRef.current;
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
      if (!text || streaming) return "";
      setError(null);
      stickRef.current = true;
      activeTextRef.current = "";

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
        if ((err as Error).name === "AbortError") return activeTextRef.current || "";
        const message = err instanceof Error ? err.message : String(err);
        applyEvent({ type: "error", message });
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
      return activeTextRef.current || "";
    },
    [streaming, applyEvent],
  );

  const liveOnTurn = useCallback(
    async (text: string) => {
      await submit(text);
      return activeTextRef.current || null;
    },
    [submit],
  );

  const liveSession = useLiveSession({
    onTurn: liveOnTurn,
    speak,
    stopSpeaking,
    onError: (message) => setError(message),
  });

  const startLive = useCallback(() => {
    setError(null);
    // If a push-to-talk capture is mid-flight, stop it so its mic isn't left on.
    end();
    setLive(true);
    liveSession.start();
  }, [liveSession, end]);

  const showSuggestions =
    transcript.length === 0 && !streaming && !error && !hydrating && !live;

  // Live-mode captions are derived straight from the transcript so they update
  // live (and auto-scroll) as the assistant streams its replies.
  const liveCaptions = live
    ? transcript
        .filter((m) => m.role === "assistant" && m.text.trim() && !m.error)
        .map((m) => ({ id: m.id, text: m.text }))
    : [];

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          background:
            "radial-gradient(600px 300px at 15% -10%, rgba(217,119,87,0.14), transparent 60%), radial-gradient(700px 320px at 95% 0%, rgba(232,184,122,0.10), transparent 60%)",
        }}
      />

      <header className="pointer-events-none relative z-10 flex items-center justify-between pl-14 pr-4 pt-5 pb-2 md:pl-6 md:pr-6">
        <div className="text-sm text-mist">
          {live ? (
            <span className="flex items-center gap-2 text-sigil">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-sigil" />
              Live session — {liveSession.status}
            </span>
          ) : speaking ? (
            <span className="flex items-center gap-2 text-sigil">
              <span className="h-1.5 w-1.5 animate-breathe rounded-full bg-sigil" />
              Speaking…
            </span>
          ) : (
            <span>Ultron ready.</span>
          )}
        </div>
        {live && liveSession.subtitle && (
          <div className="max-w-[40%] truncate text-xs text-graphite">
            {liveSession.subtitle}
          </div>
        )}
        {listening && !live && (
          <div className="text-xs text-bad">Listening… click mic to stop</div>
        )}
      </header>

      <div className="relative z-10 min-h-0 flex-1">
          {live ? (
            <LiveMode
              status={liveSession.status}
              captions={liveCaptions}
              onStop={() => {
                liveSession.stop();
                end();
                setLive(false);
              }}
            />
          ) : (
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto px-6 pb-4"
          >
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
                  isSpeaking={
                    speaking && message.role === "assistant" && message.id === speakingId
                  }
                  onSpeak={onSpeakMessage}
                />
              ))}

              {error && (
                <div className="rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
                  {error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!live && (
        <div className="relative z-10 mx-auto w-full max-w-2xl px-4 pb-6">
          <Composer
            value={draft}
            onValueChange={setDraft}
            onSend={(text) => void submit(text)}
            disabled={streaming}
            listening={listening}
            voiceEnabled
            onBeginVoice={() => void begin()}
            onEndVoice={end}
            onToggleLive={startLive}
            voices={voices}
            voiceKey={voiceKey}
            onVoiceChange={setVoiceKey}
          />
          <p className="mt-2 text-center text-[11px] text-mist">
            Agentive · local memory · Gemini / Grok / OpenRouter · voice
          </p>
        </div>
      )}
    </div>
  );
}