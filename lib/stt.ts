export const STT_PROVIDERS = ["groq", "browser"] as const;

export type SttProvider = (typeof STT_PROVIDERS)[number];

export const DEFAULT_STT_PROVIDER: SttProvider = "groq";

export function isSttProvider(value: unknown): value is SttProvider {
  return typeof value === "string" && (STT_PROVIDERS as readonly string[]).includes(value);
}

export function getSttProvider(value: unknown): SttProvider {
  return isSttProvider(value) ? value : DEFAULT_STT_PROVIDER;
}

export const STT_PROVIDER_INFO: Record<SttProvider, { label: string; description: string }> = {
  groq: {
    label: "Groq Whisper (Recommended)",
    description: "Private server-side Whisper transcription with strong accuracy. Requires GROQ_API_KEY and internet access.",
  },
  browser: {
    label: "Browser SpeechRecognition",
    description: "Uses the browser's native speech service. Fast and keyless, but support and accuracy vary by browser.",
  },
};
