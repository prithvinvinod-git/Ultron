import type { ChatEvent } from "@/ai/types";
import { QUOTA_MESSAGE, errorReason, isQuotaError } from "@/lib/store-error";

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

/**
 * Turns a thrown store/backend error into a JSON response. Quota exhaustion is
 * a 503 (retryable, not the caller's fault) with a message the UI can show;
 * anything else stays a 500.
 */
export function storeErrorResponse(err: unknown) {
  if (isQuotaError(err)) {
    return jsonError(503, QUOTA_MESSAGE, {
      degraded: true,
      reason: errorReason(err),
    });
  }
  return jsonError(500, "Database request failed.", {
    reason: errorReason(err),
  });
}