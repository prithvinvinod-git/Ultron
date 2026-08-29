import type { ChatEvent } from "@/ai/types";

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export function sseEncode(event: ChatEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function sseComment(text: string): Uint8Array {
  return new TextEncoder().encode(`: ${text}\n\n`);
}

export function jsonError(status: number, message: string, extra?: object) {
  return Response.json({ ok: false, error: message, ...extra }, { status });
}