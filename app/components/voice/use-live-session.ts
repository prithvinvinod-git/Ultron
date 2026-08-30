"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type LiveStatus = "idle" | "listening" | "thinking" | "speaking";

export interface UseLiveSessionOptions {
  /** Sends a spoken turn to the agent; resolves with the assistant's final reply text (or null). */
  onTurn: (text: string) => Promise<string | null>;
  speak: (text: string) => Promise<void>;
  stopSpeaking: () => void;
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
 * Barge-in: a turn spoken while the assistant is talking interrupts it, with a
 * short grace window so the mic doesn't trigger on its own speaker output.
 */
export function useLiveSession({
  onTurn,
  speak,
  stopSpeaking,
  onError,
}: UseLiveSessionOptions) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [subtitle, setSubtitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  const activeRef = useRef(false);
  const stoppingRef = useRef(false);
  const statusRef = useRef<LiveStatus>("idle");
  const turnBufferRef = useRef("");
  const queuedRef = useRef("");
  const dispatchTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const speakStartedAtRef = useRef(0);
  const recognitionRef = useRef<NativeRecognition | null>(null);
  const micPausedRef = useRef(false);

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
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTurnRef.current = onTurn;
    speakRef.current = speak;
    stopSpeakingRef.current = stopSpeaking;
    onErrorRef.current = onError;
  });

  const setStatusSafe = useCallback((next: LiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  // Pause microphone capture / recognition while the assistant is speaking so
  // it can't transcribe its own voice back into the conversation (echo).
  const pauseMic = useCallback(() => {
    micPausedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  const resumeMic = useCallback(() => {
    // Settle window: the tail of the assistant's speech can briefly bleed into
    // the mic after playback ends, so re-arm STT a moment later.
    window.setTimeout(() => {
      micPausedRef.current = false;
      if (
        activeRef.current &&
        !stoppingRef.current &&
        statusRef.current === "listening" &&
        !recognitionRef.current
      ) {
        if (getNativeRecognition()) startRecognition();
      }
    }, 700);
  }, [startRecognition]);

  const handleTurn = useCallback(
    async (text: string): Promise<boolean> => {
      const clean = text.trim();
      if (!clean) return true;
      if (statusRef.current === "thinking") return false;
      setSubtitle("");
      setStatusSafe("thinking");
      try {
        const reply = await onTurnRef.current(clean);
        if (!activeRef.current) return true;
        if (reply && reply.trim()) {
          setStatusSafe("speaking");
          speakStartedAtRef.current = Date.now();
          pauseMic();
          try {
            await speakRef.current(reply);
          } finally {
            resumeMic();
          }
        }
        if (!activeRef.current) return true;
        setStatusSafe("listening");
      } catch {
        onErrorRef.current?.("Live conversation failed. Switched back to listening.");
        if (activeRef.current) setStatusSafe("listening");
      }
      return true;
    },
    [setStatusSafe, pauseMic, resumeMic],
  );

  const flushQueued = useCallback(async () => {
    const queued = queuedRef.current.trim();
    if (!queued || statusRef.current !== "listening") return;
    queuedRef.current = "";
    await handleTurn(queued);
  }, [handleTurn]);

  const dispatchBuffer = useCallback(async () => {
    if (dispatchTimerRef.current !== null) {
      window.clearTimeout(dispatchTimerRef.current);
      dispatchTimerRef.current = null;
    }
    const buffer = turnBufferRef.current.trim();
    if (!buffer) return;
    turnBufferRef.current = "";
    if (statusRef.current === "thinking") {
      queuedRef.current = buffer;
      return;
    }
    if (statusRef.current === "speaking") {
      const elapsed = Date.now() - speakStartedAtRef.current;
      if (elapsed < 500) return;
      stopSpeakingRef.current();
    }
    await handleTurn(buffer);
  }, [handleTurn]);

  const scheduleDispatch = useCallback(() => {
    if (dispatchTimerRef.current !== null) {
      window.clearTimeout(dispatchTimerRef.current);
    }
    dispatchTimerRef.current = window.setTimeout(() => {
      dispatchTimerRef.current = null;
      void dispatchBuffer();
    }, 450);
  }, [dispatchBuffer]);

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
      if (data.ok && data.text?.trim()) {
        if (statusRef.current === "listening") {
          await handleTurn(data.text);
        } else {
          queuedRef.current = queuedRef.current.trim()
            ? `${queuedRef.current.trim()} ${data.text.trim()}`
            : data.text.trim();
        }
      }
    } catch {
      onErrorRef.current?.("Voice transcription failed.");
    }
    if (activeRef.current && statusRef.current === "idle") {
      setStatusSafe("listening");
    }
  }, [handleTurn, setStatusSafe]);

  const startRecorder = useCallback(() => {
    if (!streamRef.current) return;
    segmentChunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current);
    recorder.ondataavailable = (e) => {
      if (e.data.size) segmentChunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      // Requeued automatically when the agent is still busy.
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
        if (micPausedRef.current || statusRef.current !== "listening") {
          speechActiveRef.current = false;
          lastSpeechAtRef.current = null;
          return;
        }
        const buf = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        if (rms > 0.014) {
          speechActiveRef.current = true;
          lastSpeechAtRef.current = Date.now();
        } else if (
          speechActiveRef.current &&
          Date.now() - (lastSpeechAtRef.current ?? 0) > 900
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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- hoisted function declaration, identity changes per render (kept as-is)
  function startRecognition() {
    if (!activeRef.current || stoppingRef.current || micPausedRef.current) return;
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
        !micPausedRef.current &&
        restartTimerRef.current === null
      ) {
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (activeRef.current && !stoppingRef.current) startRecognition();
        }, 300);
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
    setStatusSafe("listening");
    if (getNativeRecognition()) startRecognition();
    else void startFallback();
  }, [setStatusSafe, startRecognition, startFallback]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    activeRef.current = false;
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
    turnBufferRef.current = "";
    queuedRef.current = "";
    setSubtitle("");
    setStatusSafe("idle");
  }, [endFallbackResources, setStatusSafe]);

  useEffect(() => {
    if (status === "listening" && queuedRef.current.trim()) {
      void flushQueued();
    }
  }, [status, flushQueued]);

  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      activeRef.current = false;
      if (dispatchTimerRef.current !== null) {
        window.clearTimeout(dispatchTimerRef.current);
      }
      if (restartTimerRef.current !== null) {
        window.clearTimeout(restartTimerRef.current);
      }
    };
  }, []);

  return {
    status,
    subtitle,
    error,
    start,
    stop,
  };
}