import {
  type EspFaceState,
  type EspMotion,
} from "./protocol";
import {
  inferEmotion,
  inferMotion,
  toDisplayText,
  toSpokenText,
} from "./directive";

export interface EspResponseEvent {
  id: number;
  type: "ai_response";
  text: string;
  emotion: EspFaceState;
  motion: EspMotion;
  tts: string;
  tts_text: string;
  session_id: string;
  timestamp: number;
}

let globalEventId = 0;
const eventBuffer: EspResponseEvent[] = [];
const activeListeners = new Set<(event: EspResponseEvent) => void>();

export function publishEspResponse(replyText: string, sessionId: string = "web_session"): EspResponseEvent | null {
  const reply = (replyText || "").trim();
  if (!reply) return null;

  const emotion = inferEmotion(reply);
  const motion = inferMotion(emotion, reply);
  const displayText = toDisplayText(reply);
  const spokenText = toSpokenText(reply);

  const token = process.env.ESP_DEVICE_TOKEN || "ultron_secret_123";
  const ttsUrl = `/api/esp/tts?text=${encodeURIComponent(spokenText)}&token=${encodeURIComponent(token)}`;

  globalEventId++;
  const event: EspResponseEvent = {
    id: globalEventId,
    type: "ai_response",
    text: displayText,
    emotion,
    motion,
    tts: ttsUrl,
    tts_text: spokenText,
    session_id: sessionId,
    timestamp: Date.now(),
  };

  eventBuffer.push(event);
  if (eventBuffer.length > 20) {
    eventBuffer.shift();
  }

  for (const listener of activeListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener errors
    }
  }

  return event;
}

export function getEventsSince(sinceId: number): EspResponseEvent[] {
  return eventBuffer.filter((e) => e.id > sinceId);
}

export function addEspListener(listener: (event: EspResponseEvent) => void): () => void {
  activeListeners.add(listener);
  return () => {
    activeListeners.delete(listener);
  };
}

export function getLatestEventId(): number {
  return globalEventId;
}
