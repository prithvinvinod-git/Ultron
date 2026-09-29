"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  activityPhrase,
  isStopPhrase,
  looksLikeEcho,
  thinkingFiller,
} from "@/lib/activity";
import type { ActivityKind } from "@/ai/types";

export type LiveStatus = "idle" | "listening" | "thinking" | "speaking";

export interface UseLiveSessionOptions {
  /** Sends a spoken turn to the agent; resolves with the assistant's final reply text (or null). */
  onTurn: (text: string) => Promise<string | null>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
  /** Abandons whatever the agent is currently doing (used for barge-in). */
  onInterrupt?: () => void;
  onError?: (message: string) => void;
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
 * While Ultron is working or talking the microphone stays OPEN so the user can
 * barge in: saying "stop" (or anything else that isn't an echo of the
 * read-out) cuts in, abandons the current turn, and takes the new command.
 */
export function useLiveSession({
  onTurn,
  speak,
  stopSpeaking,
  onInterrupt,
  onError,
}: UseLiveSessionOptions) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [subtitle, setSubtitle] = useState("");
  const [activity, setActivity] = useState<ActivityKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  const statusRef = useRef<LiveStatus>("idle");
  const activityRef = useRef<ActivityKind | null>(null);
  const turnBufferRef = useRef("");
  const dispatchTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const fillerTimerRef = useRef<number | null>(null);
  const speakStartedAtRef = useRef(0);
  const spokenTextRef = useRef("");
  const recognitionRef = useRef<NativeRecognition | null>(null);
  const phraseIndexRef = useRef(0);
  const fillerIndexRef = useRef(0);

  // Serialised TTS so fillers never overlap each other or the reply.
  const speechChainRef = useRef<Promise<void>>(Promise.resolve());
  const speechGenRef = useRef(0);

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

  useEffect(() => {
    onTurnRef.current = onTurn;
    speakRef.current = speak;
    stopSpeakingRef.current = stopSpeaking;
    onInterruptRef.current = onInterrupt;
    onErrorRef.current = onError;
  });

  const setStatusSafe = useCallback((next: LiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Queues a short spoken line, ignoring anything queued before this call. */
  const sayStatus = useCallback((text: string) => {
    const gen = ++speechGenRef.current;
    speechChainRef.current = speechChainRef.current
      .then(async () => {
        // A newer status (or the real reply) superseded this one — drop it.
        if (gen !== speechGenRef.current && statusRef.current !== "thinking") return;
        await speakRef.current(text);
      })
      .catch(() => {});
  }, []);

  const stopFillers = useCallback(() => {
    if (fillerTimerRef.current !== null) {
      window.clearInterval(fillerTimerRef.current);
      fillerTimerRef.current = null;
    }
  }, []);

  const startFillers = useCallback(() => {
    stopFillers();
    fillerTimerRef.current = window.setInterval(() => {
      if (!activeRef.current || statusRef.current !== "thinking") return;
      sayStatus(thinkingFiller(fillerIndexRef.current++));
    }, 4500);
  }, [sayStatus, stopFillers]);

  /**
   * Publishes what Ultron is doing. The status line always updates, but we only
   * *speak* when the kind of work changes so a long turn doesn't chatter.
   */
  const announce = useCallback(
    (next: ActivityKind, options?: { silent?: boolean }) => {
      if (!activeRef.current) return;
      const previous = activityRef.current;
      activityRef.current = next;
      setActivity(next);
      if (next !== "thinking") stopFillers();
      if (options?.silent) return;
      // Only speak when the kind of work actually changes, so a long turn
      // doesn't chatter the same line over and over.
      if (previous === next) return;
      sayStatus(activityPhrase(next, phraseIndexRef.current++));
    },
    [sayStatus, stopFillers],
  );

  const clearFillers = useCallback(() => stopFillers(), [stopFillers]);

  const handleTurn = useCallback(
    async (text: string): Promise<void> => {
      const clean = text.trim();
      if (!clean) return;
      setSubtitle("");
      setStatusSafe("thinking");
      announce("thinking", { silent: true });
      startFillers();
      try {
        const reply = await onTurnRef.current(clean);
        clearFillers();
        if (!activeRef.current) return;
        if (reply && reply.trim()) {
          // Invalidate any queued filler so the reply is the only thing spoken.
          speechGenRef.current += 1;
          setStatusSafe("speaking");
          speakStartedAtRef.current = Date.now();
          spokenTextRef.current = reply;
          activityRef.current = null;
          setActivity(null);
          try {
            await speakRef.current(reply);
          } finally {
            spokenTextRef.current = "";
          }
        }
        if (!activeRef.current) return;
        setStatusSafe("listening");
      } catch {
        clearFillers();
        onErrorRef.current?.("Live conversation failed. Switched back to listening.");
        if (activeRef.current) setStatusSafe("listening");
      }
    },
    [setStatusSafe, announce, startFillers, clearFillers],
  );

  /**
   * Called for anything heard while Ultron is speaking or thinking.
   * "stop" cancels; anything else is treated as a new command that abandons
   * the current turn — unless it is just the read-out echoing back.
   */
  const handleBargeIn = useCallback(
    (heard: string) => {
      const text = heard.trim();
      if (!text) return;

      if (isStopPhrase(text)) {
        clearFillers();
        stopSpeakingRef.current();
        onInterruptRef.current?.();
        turnBufferRef.current = "";
        spokenTextRef.current = "";
        activityRef.current = null;
        setActivity(null);
        if (activeRef.current) setStatusSafe("listening");
        return;
      }

      const words = text.split(/\s+/).filter(Boolean).length;
      if (words < 2) return;

      // Ignore the tail of our own voice coming back through the mic.
      if (statusRef.current === "speaking") {
        if (Date.now() - speakStartedAtRef.current < 700) return;
        if (looksLikeEcho(spokenTextRef.current, text)) return;
      }

      // A real new command: abandon whatever is in flight and take this one.
      clearFillers();
      stopSpeakingRef.current();
      onInterruptRef.current?.();
      turnBufferRef.current = "";
      void handleTurn(text);
    },
    [clearFillers, handleTurn, setStatusSafe],
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
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (ev) => {
      if (!activeRef.current) return;
      const e = ev as {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      };
      let finals = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finals += (finals ? " " : "") + text;
        else interim += text;
      }
      const heard = `${finals} ${interim}`.replace(/\s+/g, " ").trim();
      const state = statusRef.current;

      // While working or talking, the mic is only there for barge-in.
      if (state === "speaking" || state === "thinking") {
        if (heard) {
          setSubtitle(heard);
          handleBargeIn(heard);
        }
        return;
      }

      if (finals.trim()) {
        turnBufferRef.current = turnBufferRef.current.trim()
          ? `${turnBufferRef.current.trim()} ${finals.trim()}`
          : finals.trim();
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
      if (statusRef.current === "speaking" || statusRef.current === "thinking") {
        handleBargeIn(text);
      } else {
        turnBufferRef.current = turnBufferRef.current.trim()
          ? `${turnBufferRef.current.trim()} ${text}`
          : text;
        scheduleDispatch();
      }
    } catch {
      onErrorRef.current?.("Voice transcription failed.");
    }
    if (activeRef.current && statusRef.current === "idle") {
      setStatusSafe("listening");
    }
  }, [handleBargeIn, scheduleDispatch, setStatusSafe]);

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
    if (getNativeRecognition()) startRecognition();
    else void startFallback();
  }, [setStatusSafe, startRecognition, startFallback]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    activeRef.current = false;
    clearFillers();
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
    spokenTextRef.current = "";
    activityRef.current = null;
    setActivity(null);
    setSubtitle("");
    setStatusSafe("idle");
  }, [endFallbackResources, setStatusSafe, clearFillers]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      activeRef.current = false;
      clearFillers();
      if (dispatchTimerRef.current !== null) {
        window.clearTimeout(dispatchTimerRef.current);
      }
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
    };
  }, [clearFillers]);

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
