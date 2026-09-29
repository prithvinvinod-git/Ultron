import { existsSync } from "node:fs";
import process from "node:process";
import { pickBackend } from "@/db/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Environment/diagnostics probe. Unlike the other API routes this one never
 * touches the database, so it keeps answering even when the store is broken —
 * which is exactly the state you need to diagnose a 500 from /api/chat.
 */
export async function GET() {
  const backend = pickBackend();
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const credPathExists = credPath ? existsSync(credPath) : null;
  const tursoUrl = process.env.TURSO_DATABASE_URL ?? "file:local.db";

  const checks: Record<string, boolean | string | null> = {
    backend,
    // LLM providers
    GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
    XAI_API_KEY: Boolean(process.env.XAI_API_KEY),
    OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
    // Voice
    GROQ_API_KEY: Boolean(process.env.GROQ_API_KEY),
    // Data store
    FIREBASE_SERVICE_ACCOUNT: Boolean(process.env.FIREBASE_SERVICE_ACCOUNT),
    GOOGLE_APPLICATION_CREDENTIALS: Boolean(credPath),
    GOOGLE_APPLICATION_CREDENTIALS_exists: credPathExists,
    TURSO_DATABASE_URL_is_remote: tursoUrl.startsWith("libsql://") ||
      tursoUrl.startsWith("https://") || tursoUrl.startsWith("wss://"),
  };

  const problems: string[] = [];

  if (backend === "firestore") {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      if (credPath && credPathExists === false) {
        problems.push(
          `GOOGLE_APPLICATION_CREDENTIALS="${credPath}" does not exist on this host. ` +
            "Set FIREBASE_SERVICE_ACCOUNT to the service-account JSON (raw or base64) — file paths do not work on Vercel.",
        );
      } else if (!credPath) {
        problems.push(
          "Firestore is selected but no credentials were found. Set FIREBASE_SERVICE_ACCOUNT to the service-account JSON.",
        );
      }
    }
  } else if (tursoUrl.startsWith("file:")) {
    problems.push(
      `libSQL is using the local file "${tursoUrl}", which is NOT persistent on serverless hosts. ` +
        "Set FIREBASE_SERVICE_ACCOUNT (recommended) or a hosted libsql:// TURSO_DATABASE_URL.",
    );
  }

  return Response.json(
    {
      ok: problems.length === 0,
      checks,
      problems,
      hint: "Fix the env vars above in your host's dashboard, then redeploy.",
    },
    { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } },
  );
}
