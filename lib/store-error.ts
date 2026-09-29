/**
 * Recognises database failures that mean "the backend is out of quota" rather
 * than "your request was wrong".
 *
 * Firestore surfaces this as gRPC status 8 (RESOURCE_EXHAUSTED), which the
 * Admin SDK throws with `code: 8` and a "Quota exceeded." message. libSQL/Turso
 * reports it as a plain error string. Either way the request is not the caller's
 * fault, so the UI should say so instead of showing an opaque 500.
 */
export function isQuotaError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 8 || code === "8") return true;
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /RESOURCE_EXHAUSTED|quota exceeded|out of quota/i.test(message);
}

export const QUOTA_MESSAGE =
  "Storage is temporarily unavailable: the database quota is exhausted. It resets on the next daily cycle, or upgrade the backend plan to remove the cap.";

/** Pulls a short, human-readable reason out of an unknown thrown value. */
export function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err ?? "Unknown error");
}
