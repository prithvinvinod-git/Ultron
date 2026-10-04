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

// Event ids are seconds-since-epoch rather than a plain per-instance counter.
//
// This module's state is process-local, so on Vercel a cold start used to reset
// the counter to 0. A device that had already seen id 57 would then ask for
// "everything after 57" and silently receive nothing until the fresh instance
// had counted past 57 on its own -- so chat replies stopped reaching the robot
// with no error anywhere.
//
// Seeding from the wall clock keeps ids roughly monotonic across restarts and
// across separate instances. 1.79e9 seconds fits comfortably in the uint32 the
// firmware uses for _lastEventId, so the wire format is unchanged.
//
// Residual caveat: two instances publishing in the same second can still pick
// the same id, and a device would skip the loser of that pair. Closing that
// properly needs shared storage (Redis/KV), not process memory.
const INSTANCE_OFFSET = Math.floor(Math.random() * 1000);

function nextEventId(): number {
  const wallClock = Math.floor(Date.now() / 1000);
  const candidate = wallClock + INSTANCE_OFFSET;
  globalEventId = Math.max(globalEventId + 1, candidate);
  return globalEventId;
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

  globalEventId = nextEventId();
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
