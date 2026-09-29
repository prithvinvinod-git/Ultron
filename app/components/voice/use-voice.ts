"use client";

import { useCallback, useRef, useState } from "react";

export interface UseVoiceOptions {
  /** Live draft text, streamed while the user speaks. */
  onTranscript: (text: string) => void;
  /**
   * Final captured text, delivered when the user *closes* the recording.
   * Push-to-talk is deliberately a two-step flow: transcription streams into
   * the composer while the mic is open, and only this callback sends it.
   */
  onFinalize?: (text: string) => void;
  onError?: (message: string) => void;
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

/**
 * Push-to-talk voice. Transcribes with the browser's Web Speech API
 * (SpeechRecognition) — no server / GROQ_API_KEY required. Browsers without
 * Web Speech support (e.g. Firefox) fall back to MediaRecorder + the
 * /api/voice/asr endpoint. Speaking uses /api/voice/tts first, then the
 * browser synthesizer.
 */
export function useVoice({ onTranscript, onFinalize, onError }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceKey, setVoiceKeyState] = useState<string>(() => {
    if (typeof window === "undefined") return "aria";
    return localStorage.getItem("ultron.tts.voice") || "aria";
  });
  const mediaRef = useRef<MediaRecorder | null>(null);
  const uploadStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<NativeRecognition | null>(null);
  const finalRef = useRef("");
  const interimRef = useRef("");
  const skipPlaceholderRef = useRef(false);
  const voiceKeyRef = useRef(voiceKey);
  const speakingResolveRef = useRef<(() => void) | null>(null);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakCancelledRef = useRef(false);
  /** True while a capture session is open (mic open, awaiting the user to close). */
  const sessionRef = useRef(false);
  /** Keeps the Web Speech recognizer re-armed across its internal pauses. */
  const wantListeningRef = useRef(false);
  const wsRestartRef = useRef<number | null>(null);

  const setVoiceKey = useCallback((key: string) => {
    setVoiceKeyState(key);
    voiceKeyRef.current = key;
    try {
      localStorage.setItem("ultron.tts.voice", key);
    } catch {
      // ignore storage errors (private mode etc.)
    }
  }, []);

  const resolveSpeaking = useCallback(() => {
    setSpeaking(false);
    activeAudioRef.current = null;
    const resolve = speakingResolveRef.current;
    speakingResolveRef.current = null;
    resolve?.();
  }, []);

  const stopSpeaking = useCallback(() => {
    speakCancelledRef.current = true;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const audio = activeAudioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      try {
        audio.load();
      } catch {
        // ignore
      }
    }
    resolveSpeaking();
  }, [resolveSpeaking]);

  const speakBrowser = useCallback(
    (text: string): Promise<void> => {
      if (!("speechSynthesis" in window)) return Promise.resolve();
      window.speechSynthesis.cancel();
      return new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.02;
        speakingResolveRef.current = resolve;
        utterance.onend = () => resolveSpeaking();
        utterance.onerror = () => resolveSpeaking();
        setSpeaking(true);
        window.speechSynthesis.speak(utterance);
      });
    },
    [resolveSpeaking],
  );

  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      speakCancelledRef.current = false;
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: clean.slice(0, 3900),
            voice: voiceKeyRef.current,
          }),
        });
        if (res.ok) {
          if (speakCancelledRef.current) return;
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          activeAudioRef.current = audio;
          setSpeaking(true);
          // Resolve only when playback actually ends so callers (live mode)
          // don't re-arm the microphone while the assistant is still talking.
          await new Promise<void>((resolve) => {
            speakingResolveRef.current = resolve;
            audio.onended = () => resolveSpeaking();
            audio.onerror = () => {
              resolveSpeaking();
              if (!speakCancelledRef.current) void speakBrowser(clean);
            };
            void audio.play().catch(() => {
              resolveSpeaking();
              if (!speakCancelledRef.current) void speakBrowser(clean);
            });
          });
          return;
        }
      } catch {
        // fall through to browser TTS
      }
      await speakBrowser(clean);
    },
    [resolveSpeaking, speakBrowser],
  );

  const liveGenRef = useRef(0);

  // Server fallback only: transcribe a recorded clip via /api/voice/asr.
  const transcribeBlob = useCallback(
    async (blob: Blob, mime: string, isLive: boolean) => {
      if (!blob.size) return;
      const gen = liveGenRef.current;
      const audioB64 = await blobToBase64(blob);
      try {
        const res = await fetch("/api/voice/asr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: audioB64, mimeType: mime }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          text?: string;
          error?: string;
        };
        console.log("[voice] asr result", {
          ok: data.ok,
          text: data.text,
          live: isLive,
        });
        // Only apply if not superseded by a newer transcription (e.g. the final one).
        if (gen !== liveGenRef.current) return;
        if (data.ok && data.text) {
          const text = data.text.trim();
          // Live ticks refresh the draft; the closing clip is what gets sent.
          if (isLive) onTranscript(text);
          else if (onFinalize) onFinalize(text);
          else onTranscript(text);
        } else if (!isLive) {
          // A final clip that produced no speech: insert a period so the field
          // isn't left silently empty (the user can review/clear it).
          if (data.error) onError?.(data.error);
          onTranscript(".");
        }
      } catch {
        // ignore transient errors on live ticks; end-of-recording handles errors
      }
    },
    [onTranscript, onFinalize, onError],
  );

  // Commit whatever was captured and hand it to the caller. Push-to-talk only
  // reaches here once the user has *closed* the recording, so this is the
  // single place a spoken turn is actually sent.
  const finalizeCapture = useCallback(() => {
    liveGenRef.current += 1; // invalidate any in-flight server fallback tick
    sessionRef.current = false;
    wantListeningRef.current = false;
    setListening(false);
    const text =
      finalRef.current +
      (interimRef.current
        ? (finalRef.current ? " " : "") + interimRef.current
        : "");
    const skipPlaceholder = skipPlaceholderRef.current;
    skipPlaceholderRef.current = false;
    finalRef.current = "";
    interimRef.current = "";
    if (text.trim()) {
      const clean = text.trim();
      if (onFinalize) onFinalize(clean);
      else onTranscript(clean);
    } else if (!skipPlaceholder) {
      // No speech was captured: insert a period so the field isn't left
      // silently empty (the user can review/clear it). Nothing is sent.
      onTranscript(".");
    }
  }, [onTranscript, onFinalize]);

  const stopRecognition = useCallback(() => {
    wantListeningRef.current = false;
    if (wsRestartRef.current !== null) {
      window.clearTimeout(wsRestartRef.current);
      wsRestartRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, []);

  // Primary path: browser Web Speech API (SpeechRecognition). No server call,
  // so transcription works without GROQ_API_KEY.
  //
  // The recognizer runs in continuous mode and re-arms itself whenever the
  // browser pauses it, so the mic stays open after each phrase until the user
  // explicitly closes the recording.
  const startWebSpeech = useCallback(() => {
    const SR = getNativeRecognition();
    if (!SR) return false;
    finalRef.current = "";
    interimRef.current = "";
    skipPlaceholderRef.current = false;
    wantListeningRef.current = true;

    const attach = (): boolean => {
      if (!wantListeningRef.current) return true;
      const recognition = new SR();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (ev) => {
        if (!wantListeningRef.current) return;
        const e = ev as {
          resultIndex: number;
          results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
        };
        let finals = "";
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const text = e.results[i][0].transcript;
          if (e.results[i].isFinal) finals += (finals ? " " : "") + text;
          else interim += text;
        }
        if (finals) {
          finalRef.current = finalRef.current.trim()
            ? `${finalRef.current.trim()} ${finals.trim()}`
            : finals.trim();
        }
        interimRef.current = interim;
        const combined =
          finalRef.current + (interim ? (finalRef.current ? " " : "") + interim : "");
        if (combined.trim()) onTranscript(combined.trim());
      };

      recognition.onerror = (ev) => {
        const e = ev as { error?: string };
        // Permission problems: stop cleanly and surface the error. Other
        // errors ('no-speech', 'aborted', …) are recovered in onend.
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          skipPlaceholderRef.current = true;
          wantListeningRef.current = false;
          stopRecognition();
          onError?.("Microphone access denied.");
        }
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        if (wantListeningRef.current) {
          // Chrome/Edge stop the recognizer after a pause in the audio. Re-arm
          // it so the capture session survives natural silence.
          wsRestartRef.current = window.setTimeout(() => {
            wsRestartRef.current = null;
            if (wantListeningRef.current) attach();
          }, 200);
          return;
        }
        finalizeCapture();
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        setListening(true);
        return true;
      } catch (err) {
        console.error("[voice] Web Speech start failed", err);
        wantListeningRef.current = false;
        return false;
      }
    };

    return attach();
  }, [onTranscript, onError, stopRecognition, finalizeCapture]);

  // Fallback for browsers without the Web Speech API: MediaRecorder + the
  // server ASR endpoint (works when GROQ_API_KEY is configured).
  const beginFallback = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      uploadStreamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      console.log("[voice] mic device", {
        label: track?.label,
        deviceId: track?.getSettings?.().deviceId,
        sampleRate: track?.getSettings?.().sampleRate,
      });

      // Live loudness meter so we can confirm real sound reaches the browser.
      let peak = 0;
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const levels = new Float32Array(analyser.fftSize);
      const meterTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(levels);
        let sum = 0;
        for (let i = 0; i < levels.length; i++) sum += levels[i] * levels[i];
        peak = Math.max(peak, Math.sqrt(sum / levels.length));
      }, 120);

      // Prefer a container Whisper decodes reliably; fall back to what the
      // browser reports as its default.
      const mimes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mime = mimes.find(
        (m) =>
          typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
      );
      const options = mime ? { mimeType: mime } : undefined;
      const recorder = new MediaRecorder(stream, options);
      chunksRef.current = [];
      const startedAt = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };

      // Live transcription: while holding, re-transcribe the whole clip so far
      // periodically and replace the draft — giving "appears as you speak" feel.
      let busy = false;
      const tick = async () => {
        if (busy || chunksRef.current.length === 0) return;
        busy = true;
        const currentMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: currentMime });
        // Only bother once there's enough audio to contain speech.
        if (blob.size > 6000) {
          await transcribeBlob(blob, currentMime, true);
        }
        busy = false;
      };
      const liveTimer = window.setInterval(() => void tick(), 1600);

      recorder.onstop = () => {
        window.clearInterval(meterTimer);
        window.clearInterval(liveTimer);
        void audioCtx.close().catch(() => {});
        stream.getTracks().forEach((t) => t.stop());
        sessionRef.current = false;
        setListening(false);
        mediaRef.current = null;
        // Bump generation so any in-flight live tick cannot overwrite the final.
        liveGenRef.current += 1;
        const recMime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: recMime });
        console.log("[voice] recorded", {
          mime: recMime,
          sizeBytes: blob.size,
          durationMs: Date.now() - startedAt,
          chunks: chunksRef.current.length,
          peakLevel: peak.toFixed(4),
        });
        if (!blob.size) {
          onError?.("No audio was captured — please try again.");
          return;
        }
        void transcribeBlob(blob, recMime, false);
      };

      recorder.start(250);
      mediaRef.current = recorder;
      setListening(true);
    } catch {
      onError?.("Microphone access denied.");
      setListening(false);
    }
  }, [onError, transcribeBlob]);

  const begin = useCallback(async () => {
    if (listening) return;
    stopSpeaking();
    sessionRef.current = true;
    setListening(true);

    // Prefer the browser Web Speech API so transcription works without a
    // server round-trip (no GROQ_API_KEY needed).
    if (startWebSpeech()) return;

    // Browsers without SpeechRecognition fall back to recording + server ASR.
    await beginFallback();
  }, [listening, stopSpeaking, startWebSpeech, beginFallback]);

  /**
   * Closes the capture session. This is the "send" gesture: the recognizer is
   * asked to finish, its trailing result is folded in, and only then is the
   * captured text handed to `onFinalize` for sending.
   */
  const end = useCallback(() => {
    if (!sessionRef.current) return;
    sessionRef.current = false;
    wantListeningRef.current = false;
    if (wsRestartRef.current !== null) {
      window.clearTimeout(wsRestartRef.current);
      wsRestartRef.current = null;
    }
    if (recognitionRef.current) {
      // onend fires after any pending result is delivered, then finalizes.
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      return;
    }
    if (mediaRef.current && mediaRef.current.state === "recording") {
      mediaRef.current.stop();
      return;
    }
    // The recognizer had already ended on its own — commit what we have.
    finalizeCapture();
  }, [finalizeCapture]);

  const toggle = useCallback(() => {
    if (listening) end();
    else void begin();
  }, [listening, begin, end]);

  const cleanupStreams = useCallback(() => {
    stopRecognition();
    uploadStreamRef.current?.getTracks().forEach((t) => t.stop());
    uploadStreamRef.current = null;
  }, [stopRecognition]);

  return {
    listening,
    speaking,
    begin,
    end,
    toggle,
    speak,
    stopSpeaking,
    cleanupStreams,
    voiceKey,
    setVoiceKey,
  };
}