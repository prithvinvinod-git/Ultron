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
 * Push-to-talk voice. Prefers the browser's Web Speech API for speech-to-text
 * (free, works offline, zero keys). Falls back to MediaRecorder + the
 * /api/voice/asr endpoint (Groq Whisper) when SpeechRecognition is missing.
 * Speaking uses /api/voice/tts first, then the browser synthesizer.
 */
export function useVoice({ onTranscript, onError }: UseVoiceOptions) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const uploadStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<{
    stop: () => void;
    abort: () => void;
    start: () => void;
  } | null>(null);

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

  const begin = useCallback(async () => {
    if (listening) return;
    stopSpeaking();

    const SpeechRecognitionCtor = (
      window as unknown as {
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          start: () => void;
          stop: () => void;
          abort: () => void;
          onresult: ((e: unknown) => void) | null;
          onend: (() => void) | null;
          onerror: ((e: unknown) => void) | null;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          continuous: boolean;
          start: () => void;
          stop: () => void;
          abort: () => void;
          onresult: ((e: unknown) => void) | null;
          onend: (() => void) | null;
          onerror: ((e: unknown) => void) | null;
        };
      }
    ).SpeechRecognition ||
    (window as unknown as {
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        start: () => void;
        stop: () => void;
        abort: () => void;
        onresult: ((e: unknown) => void) | null;
        onend: (() => void) | null;
        onerror: ((e: unknown) => void) | null;
      };
    }).webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = "en-US";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onresult = (event: unknown) => {
        const e = event as {
          resultIndex: number;
          results: ArrayLike<{ 0: { transcript: string } }>;
        };
        let text = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          text += e.results[i][0].transcript;
        }
        if (text.trim()) onTranscript(text.trim());
      };
      recognition.onend = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      recognition.onerror = () => {
        setListening(false);
        recognitionRef.current = null;
      };
      try {
        recognition.start();
        recognitionRef.current = recognition;
        setListening(true);
        return;
      } catch {
        // fall through to MediaRecorder path
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      uploadStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setListening(false);
        const mime = recorder.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        if (!blob.size) return;
        const audioB64 = await blobToBase64(blob);
        try {
          const res = await fetch("/api/voice/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio: audioB64, mimeType: mime }),
          });
          const data = (await res.json()) as { ok?: boolean; text?: string };
          if (data.ok && data.text) onTranscript(data.text);
        } catch {
          onError?.("Voice transcription failed.");
        }
      };
      recorder.start();
      mediaRef.current = recorder;
      setListening(true);
    } catch {
      onError?.("Microphone access denied.");
      setListening(false);
    }
  }, [listening, onTranscript, onError, stopSpeaking]);

  const end = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current = null;
        setListening(false);
      }
    } else if (mediaRef.current && mediaRef.current.state === "recording") {
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