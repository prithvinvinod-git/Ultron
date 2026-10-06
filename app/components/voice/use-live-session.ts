"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Conversation, type Conversation as ElevenLabsConversation } from "@elevenlabs/client";
import {
  activitySpokenWord,
  isStopPhrase,
  longWaitLine,
} from "@/lib/activity";
import type { ActivityKind } from "@/ai/types";

export type LiveStatus = "idle" | "listening" | "thinking" | "speaking";

export interface UseLiveSessionOptions {
  /** Sends a spoken turn to the agent; resolves with the assistant's final reply text (or null). */
  onTurn: (text: string) => Promise<string | null>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  /** Abandons whatever the agent is currently doing (stop phrase). */
  onInterrupt?: () => void;
  onError?: (message: string) => void;
  /**
   * Settings > Behaviour > "Speak replies". When false the reply is still
   * shown and returned, it is just never read aloud.
   */
  speakReplies?: boolean;
  /** When set, use the ElevenLabs Conversational AI agent instead of local STT/TTS. */
  elevenLabsAgent?: boolean;
}

type NativeRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: unknown) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
};

function getNativeRecognition(): (new () => NativeRecognition) | undefined {
  const w = window as unknown as {
    SpeechRecognition?: new () => NativeRecognition;
    webkitSpeechRecognition?: new () => NativeRecognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Hands-free conversational loop (ChatGPT/Gemini live-mode style): continuously
 * listens, sends each spoken turn to the agent, speaks the reply, then returns
 * to listening. Only `stop()` ends the session.
 *
 * While Ultron is working the microphone stays open, but nothing it hears can
 * end the turn — that used to be barge-in, and it aborted the reply mid-stream.
 * A deliberate stop phrase while Ultron is speaking still cuts it off.
 */
export function useLiveSession({
  onTurn,
  speak,
  stopSpeaking,
  onInterrupt,
  onError,
  speakReplies = true,
  elevenLabsAgent = false,
}: UseLiveSessionOptions) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [subtitle, setSubtitle] = useState("");
  const [activity, setActivity] = useState<ActivityKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  /**
   * The mic is shut for the whole turn, while Ultron works and while it talks.
   * Web Speech gets no echo cancellation (on Chrome we never open a
   * `getUserMedia` stream at all), so leaving it live meant it faithfully
   * transcribed Ultron's own read-out — which is exactly what barge-in used to
   * misfire on. Pausing the mic outright is simpler and completely total.
   */
  const micPausedRef = useRef(false);
  /** Same trick for the fallback recorder, used when resuming a paused mic. */
  const startRecorderRef = useRef<(() => void) | null>(null);
  /**
   * Same trick for `startRecognition`. It is a hoisted function declaration, so
   * calling it from `resumeMic` would work at runtime, but the hooks lint rules
   * reject reading it before its declaration point — hence the indirection.
   */
  const startRecognitionRef = useRef<(() => void) | null>(null);
  const statusRef = useRef<LiveStatus>("idle");
  const activityRef = useRef<ActivityKind | null>(null);
  const turnBufferRef = useRef("");
  const dispatchTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const longWaitTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<NativeRecognition | null>(null);
  /**
   * Web Speech re-fires `onresult` with a `resultIndex` that can point at
   * results already consumed (it only marks the first *changed* one), so
   * rebuilding the sentence from `resultIndex` re-appends earlier words — that
   * is what made one short sentence show up four times. Final results are
   * therefore committed exactly once, tracked by index.
   */
  const lastFinalIndexRef = useRef(-1);
  const longWaitIndexRef = useRef(0);
  /** One spoken status word per command — the "no looping" guarantee. */
  const statusSpokenRef = useRef(false);
  /** At most one long-wait line per command, so silence is covered, not filled. */
  const longWaitSpokenRef = useRef(false);
  const elevenLabsConversationRef = useRef<ElevenLabsConversation | null>(null);

  /*
   * Speech queue. An explicit queue (rather than a chain of promises) is what
   * makes the reply reliably audible: anything queued can be dropped in one
   * move, playback is strictly serialised, and a status line can never talk
   * over the answer.
   */
  const pendingRef = useRef<{ text: string; seq: number }[]>([]);
  const seqRef = useRef(0);
  const dropBeforeRef = useRef(0);
  const pumpingRef = useRef(false);
  const currentSpeechRef = useRef<Promise<void> | null>(null);
  const drainResolversRef = useRef<(() => void)[]>([]);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const segmentChunksRef = useRef<Blob[]>([]);
  const vadIdRef = useRef<number | null>(null);
  const speechActiveRef = useRef(false);
  const lastSpeechAtRef = useRef<number | null>(null);

  const onTurnRef = useRef(onTurn);
  const speakRef = useRef(speak);
  const stopSpeakingRef = useRef(stopSpeaking);
  const onInterruptRef = useRef(onInterrupt);
  const onErrorRef = useRef(onError);
  // Mirror of the "speak replies" toggle, so the stable speech/interrupt
  // callbacks below see the current preference without being rebuilt.
  const speakRepliesRef = useRef(speakReplies);

  useEffect(() => {
    onTurnRef.current = onTurn;
    speakRef.current = speak;
    stopSpeakingRef.current = stopSpeaking;
    onInterruptRef.current = onInterrupt;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    speakRepliesRef.current = speakReplies;
  }, [speakReplies]);

  const setStatusSafe = useCallback((next: LiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Drops everything queued but not yet spoken. */
  const cancelQueuedSpeech = useCallback(() => {
    dropBeforeRef.current = seqRef.current + 1;
    pendingRef.current = [];
  }, []);

  /** Serialised player: one line at a time, newest-first wins on cancel. */
  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (pendingRef.current.length > 0 && activeRef.current) {
        const item = pendingRef.current.shift();
        if (!item) break;
        // Superseded while waiting its turn.
        if (item.seq < dropBeforeRef.current) continue;
        // "Speak replies" is off: the text still shows on screen and the
        // captions still work, we just never open the audio pipeline. Note we
        // must NOT touch the status here — this runs while the turn is still
        // `thinking`/`speaking`, and claiming "listening" here both lied about
        // the turn and, now that the mic is paused for the turn, implied it was
        // open when it is not.
        if (!speakRepliesRef.current) continue;
        const played = speakRef.current(item.text).catch(() => {});
        currentSpeechRef.current = played;
        try {
          await played;
        } finally {
          if (currentSpeechRef.current === played) currentSpeechRef.current = null;
        }
      }
    } finally {
      pumpingRef.current = false;
      const resolvers = drainResolversRef.current;
      drainResolversRef.current = [];
      for (const resolve of resolvers) resolve();
    }
  }, [setStatusSafe]);

  const enqueueSpeech = useCallback(
    (text: string) => {
      if (!activeRef.current) return;
      pendingRef.current.push({ text, seq: ++seqRef.current });
      void pump();
    },
    [pump],
  );

  /**
   * Speaks the assistant's answer. It supersedes any queued status line, waits
   * for whatever short line is currently playing to finish, and resolves when
   * the answer has actually been spoken.
   */
  const speakReply = useCallback(
    async (text: string) => {
      cancelQueuedSpeech();
      // Let a status word finish rather than chopping it off mid-word.
      if (currentSpeechRef.current) await currentSpeechRef.current.catch(() => {});
      const done = new Promise<void>((resolve) => {
        drainResolversRef.current.push(resolve);
      });
      pendingRef.current.push({ text, seq: ++seqRef.current });
      void pump();
      await done;
    },
    [cancelQueuedSpeech, pump],
  );

  const stopLongWait = useCallback(() => {
    if (longWaitTimerRef.current !== null) {
      window.clearTimeout(longWaitTimerRef.current);
      longWaitTimerRef.current = null;
    }
  }, []);

  /**
   * Stops listening for the duration of a turn. Nothing heard while paused can
   * dispatch, interrupt or leak into the next turn, because there is no longer
   * any recogniser running to hear it.
   */
  const pauseMic = useCallback(() => {
    micPausedRef.current = true;
    setSubtitle("");
    // Native path: abort the recogniser. `onend` sees the pause flag and does
    // not schedule its usual restart.
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    // Fallback path: stop capturing. `transcribeFallback` drops the segment
    // because of the pause flag, so nothing is transcribed or dispatched.
    if (recorderRef.current?.state !== "inactive") {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  /** Re-opens the mic once the turn is over and the read-out has finished. */
  const resumeMic = useCallback(() => {
    if (!activeRef.current || stoppingRef.current) return;
    micPausedRef.current = false;
    if (!getNativeRecognition()) {
      // The stream survives a pause, so only the recorder needs restarting.
      if (recorderRef.current === null && streamRef.current) startRecorderRef.current?.();
      return;
    }
    if (recognitionRef.current === null) startRecognitionRef.current?.();
  }, []);

  /**
   * One line, at most, and only if the turn drags on. The old code looped
   * filler every 4.5s, which is what made Ultron sound stuck; now a slow turn
   * says one short line and then goes quiet until the answer.
   */
  const armLongWait = useCallback(() => {
    stopLongWait();
    longWaitTimerRef.current = window.setTimeout(() => {
      longWaitTimerRef.current = null;
      if (!activeRef.current || statusRef.current !== "thinking") return;
      if (longWaitSpokenRef.current) return;
      longWaitSpokenRef.current = true;
      enqueueSpeech(longWaitLine(longWaitIndexRef.current++));
    }, 8000);
  }, [stopLongWait, enqueueSpeech]);

  /**
   * Publishes what Ultron is doing. The status line always updates, but it is
   * spoken only once per command, as a single word, and never over the answer.
   */
  const announce = useCallback(
    (next: ActivityKind, options?: { silent?: boolean }) => {
      if (!activeRef.current) return;
      activityRef.current = next;
      setActivity(next);
      if (options?.silent) return;
      // Never talk over the read-out, and never repeat mid-turn.
      if (statusRef.current === "speaking") return;
      if (statusSpokenRef.current) return;
      statusSpokenRef.current = true;
      enqueueSpeech(activitySpokenWord(next));
    },
    [enqueueSpeech],
  );

  const handleTurn = useCallback(
    async (text: string): Promise<void> => {
      const clean = text.trim();
      if (!clean) return;
      setSubtitle("");
      // Stop listening for the whole turn. Ultron is about to talk, and the mic
      // has no echo cancellation, so leaving it open only feeds it our own
      // voice. It re-opens the moment the answer has finished being read out.
      pauseMic();
      setStatusSafe("thinking");
      statusSpokenRef.current = false;
      longWaitSpokenRef.current = false;
      // Clear anything left over from the previous command first.
      cancelQueuedSpeech();
      announce("thinking");
      armLongWait();
      try {
        const reply = await onTurnRef.current(clean);
        stopLongWait();
        if (!activeRef.current) return;
        if (reply && reply.trim()) {
          setStatusSafe("speaking");
          activityRef.current = null;
          setActivity(null);
          await speakReply(reply);
        }
      } catch {
        stopLongWait();
        onErrorRef.current?.("Live conversation failed. Switched back to listening.");
      } finally {
        // Resume even on failure: the mic must never stay shut, or the loop
        // would be dead for the rest of the session with no visible cause.
        if (activeRef.current) {
          setStatusSafe("listening");
          resumeMic();
        }
      }
    },
    [
      setStatusSafe,
      pauseMic,
      resumeMic,
      announce,
      armLongWait,
      stopLongWait,
      cancelQueuedSpeech,
      speakReply,
    ],
  );

  /**
   * Interrupts the current turn, but ONLY for a deliberate stop phrase.
   *
   * Barge-in was removed here on purpose. It used to abandon a turn whenever
   * two or more words were heard while Ultron was `thinking` — and the echo and
   * 700ms guards below only ever ran while `speaking`. Because Web Speech
   * accumulates finals across results, the assistant's own "Thinking" filler
   * came back through the mic, reached two words, and aborted the in-flight
   * `/api/chat` stream. Since the client only captured assistant text on the
   * `done` frame, that abort threw the whole reply away: no text, no speech,
   * and the queued filler was dropped by `cancelQueuedSpeech()`.
   *
   * So while thinking we now ignore the microphone entirely — it is open, but
   * nothing it hears can end the turn. An explicit "stop" while speaking still
   * works, because that is the user's own hand, not an echo.
   */
  const handleInterruption = useCallback(
    (heard: string) => {
      const text = heard.trim();
      if (!text) return;
      // Only a deliberate cancellation counts, and only while there is
      // something audible to cut off.
      if (statusRef.current !== "speaking") return;
      if (!isStopPhrase(text)) return;

      stopLongWait();
      cancelQueuedSpeech();
      stopSpeakingRef.current();
      onInterruptRef.current?.();
      turnBufferRef.current = "";
      activityRef.current = null;
      setActivity(null);
      setStatusSafe("listening");
    },
    [stopLongWait, cancelQueuedSpeech, setStatusSafe],
  );


  const dispatchBuffer = useCallback(async () => {
    if (dispatchTimerRef.current !== null) {
      window.clearTimeout(dispatchTimerRef.current);
      dispatchTimerRef.current = null;
    }
    const buffer = turnBufferRef.current.trim();
    if (!buffer) return;
    turnBufferRef.current = "";
    await handleTurn(buffer);
  }, [handleTurn]);

  const scheduleDispatch = useCallback(() => {
    if (dispatchTimerRef.current !== null) {
      window.clearTimeout(dispatchTimerRef.current);
    }
    dispatchTimerRef.current = window.setTimeout(() => {
      dispatchTimerRef.current = null;
      void dispatchBuffer();
    }, 700);
  }, [dispatchBuffer]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- hoisted function declaration, identity changes per render (kept as-is)
  function startRecognition() {
    if (!activeRef.current || stoppingRef.current) return;
    const SR = getNativeRecognition();
    if (!SR) {
      void startFallback();
      return;
    }
    const recognition = new SR();
    // A new recognition session indexes its results from 0 again.
    lastFinalIndexRef.current = -1;
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (ev) => {
      if (!activeRef.current) return;
      const e = ev as {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      };
      let freshFinals = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = (result[0]?.transcript ?? "").trim();
        if (!text) continue;
        if (result.isFinal) {
          // Already committed in an earlier event — never speak it twice.
          if (i <= lastFinalIndexRef.current) continue;
          lastFinalIndexRef.current = i;
          freshFinals += (freshFinals ? " " : "") + text;
        } else {
          // Interim text is only ever displayed, so re-reading it is harmless.
          interim += text;
        }
      }

      const state = statusRef.current;

      // While Ultron is working, the mic is open but deliberately ignored:
      // whatever it hears cannot end the turn (see handleInterruption), and
      // nothing is accumulated, so the echo of our own voice cannot linger and
      // contaminate the next turn. Showing it as a subtitle was worse than
      // useless — it flickered with the read-out.
      if (state === "thinking") return;

      // While speaking, only an explicit stop phrase is honoured. Note this
      // reads the *unaccumulated* interim text, so the assistant's own read-out
      // can never masquerade as the user saying "stop".
      if (state === "speaking") {
        if (interim.trim()) handleInterruption(interim);
        return;
      }

      // Idle or listening: this is real user speech, so it counts.
      if (freshFinals) {
        turnBufferRef.current = turnBufferRef.current.trim()
          ? `${turnBufferRef.current.trim()} ${freshFinals}`
          : freshFinals;
        scheduleDispatch();
      }
      setSubtitle(interim.trim() || turnBufferRef.current.trim());
    };

    recognition.onerror = () => {
      // onend restarts the session when appropriate.
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (
        activeRef.current &&
        !stoppingRef.current &&
        !micPausedRef.current &&
        restartTimerRef.current === null
      ) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (activeRef.current && !stoppingRef.current) startRecognition();
        }, 250);
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      if (statusRef.current === "idle") setStatusSafe("listening");
    } catch {
      void startFallback();
    }
  }

  const transcribeFallback = useCallback(async () => {
    const chunks = segmentChunksRef.current;
    segmentChunksRef.current = [];
    if (!chunks.length) return;
    // The recorder was stopped because the mic is paused, not because the user
    // finished speaking. This segment is Ultron's own audio — throw it away.
    if (micPausedRef.current) return;
    const mime = recorderRef.current?.mimeType || "audio/webm";
    const blob = new Blob(chunks, { type: mime });
    try {
      const b64 = await blobToBase64(blob);
      const res = await fetch("/api/voice/asr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, mimeType: mime }),
      });
      const data = (await res.json()) as { ok?: boolean; text?: string };
      const text = data.ok ? (data.text ?? "").trim() : "";
      if (!text) return;
      if (statusRef.current !== "idle" && statusRef.current !== "listening") {
        handleInterruption(text);
        return;
      }
      turnBufferRef.current = turnBufferRef.current.trim()
        ? `${turnBufferRef.current.trim()} ${text}`
        : text;
      scheduleDispatch();
    } catch {
      onErrorRef.current?.("Voice transcription failed.");
    }
    if (activeRef.current && statusRef.current === "idle") {
      setStatusSafe("listening");
    }
  }, [handleInterruption, scheduleDispatch, setStatusSafe]);

  const startRecorder = useCallback(() => {
    if (!streamRef.current) return;
    segmentChunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current);
    recorder.ondataavailable = (e) => {
      if (e.data.size) segmentChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      if (!activeRef.current) return;
      void transcribeFallback();
    };
    recorder.start(1000);
    recorderRef.current = recorder;
  }, [transcribeFallback]);

  // `resumeMic` is declared above both of these, so hand it the callables.
  useEffect(() => {
    startRecorderRef.current = startRecorder;
  }, [startRecorder]);

  useEffect(() => {
    startRecognitionRef.current = () => startRecognition();
  });

  const startFallback = useCallback(async () => {
    if (!activeRef.current || stoppingRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;
      startRecorder();
      vadIdRef.current = window.setInterval(() => {
        if (!activeRef.current || !analyserRef.current) return;
        const buf = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.02) {
          speechActiveRef.current = true;
          lastSpeechAtRef.current = Date.now();
        } else if (
          speechActiveRef.current &&
          Date.now() - (lastSpeechAtRef.current ?? 0) > 700
        ) {
          speechActiveRef.current = false;
          lastSpeechAtRef.current = null;
          recorderRef.current?.stop();
        }
      }, 120);
      setStatusSafe("listening");
    } catch {
      onErrorRef.current?.("Microphone access denied.");
      activeRef.current = false;
      setStatusSafe("idle");
    }
  }, [startRecorder, setStatusSafe]);

  const endFallbackResources = useCallback(() => {
    if (vadIdRef.current !== null) {
      window.clearInterval(vadIdRef.current);
      vadIdRef.current = null;
    }
    if (recorderRef.current?.state !== "inactive") {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    stoppingRef.current = false;
    setError(null);
    setSubtitle("");
    activityRef.current = null;
    setActivity(null);
    setStatusSafe("listening");

    if (elevenLabsAgent) {
      void (async () => {
        try {
          const response = await fetch("/api/voice/elevenlabs/signed-url", { cache: "no-store" });
          const data = (await response.json()) as { signedUrl?: string; error?: string };
          if (!response.ok || !data.signedUrl) throw new Error(data.error ?? "Could not start ElevenLabs agent.");
          if (!activeRef.current) return;
          elevenLabsConversationRef.current = await Conversation.startSession({
            signedUrl: data.signedUrl,
            onConnect: () => setStatusSafe("listening"),
            onDisconnect: () => {
              if (activeRef.current) setStatusSafe("idle");
            },
            onError: (message) => onErrorRef.current?.(String(message)),
            onModeChange: ({ mode }) => setStatusSafe(mode === "speaking" ? "speaking" : "listening"),
          });
        } catch (error) {
          activeRef.current = false;
          setStatusSafe("idle");
          onErrorRef.current?.(error instanceof Error ? error.message : "ElevenLabs live agent failed to start.");
        }
      })();
      return;
    }

    if (getNativeRecognition()) startRecognition();
    else void startFallback();
  }, [elevenLabsAgent, setStatusSafe, startRecognition, startFallback]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    activeRef.current = false;
    if (elevenLabsConversationRef.current) {
      void elevenLabsConversationRef.current.endSession().catch(() => {});
      elevenLabsConversationRef.current = null;
    }
    micPausedRef.current = false;
    stopLongWait();
    cancelQueuedSpeech();
    drainResolversRef.current = [];
    if (dispatchTimerRef.current !== null) {
      window.clearTimeout(dispatchTimerRef.current);
      dispatchTimerRef.current = null;
    }
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    recognitionRef.current = null;
    endFallbackResources();
    stopSpeakingRef.current();
    onInterruptRef.current?.();
    turnBufferRef.current = "";
    activityRef.current = null;
    setActivity(null);
    setSubtitle("");
    setStatusSafe("idle");
  }, [endFallbackResources, setStatusSafe, stopLongWait, cancelQueuedSpeech]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      activeRef.current = false;
      micPausedRef.current = false;
      stopLongWait();
      cancelQueuedSpeech();
      if (dispatchTimerRef.current !== null) {
        window.clearTimeout(dispatchTimerRef.current);
      }
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
    };
  }, [stopLongWait, cancelQueuedSpeech]);

  return {
    status,
    subtitle,
    error,
    activity,
    announce,
    start,
    stop,
  };
}
