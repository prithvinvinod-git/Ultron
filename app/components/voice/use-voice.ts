"use client";

import { useCallback, useRef, useState } from "react";

export interface UseVoiceOptions {
  onTranscript: (text: string) => void;
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

/**
 * Push-to-talk voice. Records audio with the browser's MediaRecorder and
 * transcribes it via the /api/voice/asr endpoint (Groq Whisper) for reliable,
 * accurate transcription into the composer. Speaking uses /api/voice/tts
 * first, then the browser synthesizer.
 */
export function useVoice({ onTranscript, onError }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const uploadStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const stopSpeaking = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speakBrowser = useCallback(
    (text: string) => {
      if (!("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.02;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  const speak = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      try {
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: clean.slice(0, 3900) }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          setSpeaking(true);
          audio.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setSpeaking(false);
            URL.revokeObjectURL(url);
            speakBrowser(clean);
          };
          await audio.play();
          return;
        }
      } catch {
        // fall through to browser TTS
      }
      speakBrowser(clean);
    },
    [speakBrowser],
  );

  const liveGenRef = useRef(0);

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
          onTranscript(data.text.trim());
        } else if (!isLive && data.error) {
          onError?.(data.error);
        }
      } catch {
        // ignore transient errors on live ticks; end-of-recording handles errors
      }
    },
    [onTranscript, onError],
  );

  const begin = useCallback(async () => {
    if (listening) return;
    stopSpeaking();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
        (m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m),
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
    } catch (err) {
      onError?.("Microphone access denied.");
      console.error("[voice] start failed", err);
      setListening(false);
    }
  }, [listening, onError, stopSpeaking, transcribeBlob]);

  const end = useCallback(() => {
    if (mediaRef.current && mediaRef.current.state === "recording") {
      mediaRef.current.stop();
    } else {
      setListening(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (listening) end();
    else void begin();
  }, [listening, begin, end]);

  const cleanupStreams = useCallback(() => {
    uploadStreamRef.current?.getTracks().forEach((t) => t.stop());
    uploadStreamRef.current = null;
  }, []);

  return {
    listening,
    speaking,
    begin,
    end,
    toggle,
    speak,
    stopSpeaking,
    cleanupStreams,
  };
}