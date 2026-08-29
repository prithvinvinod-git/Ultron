import { getProviderStatus } from "@/ai/providers";
import { voiceEnginesConfigured } from "@/ai/voice/speech";
import { memoryCount } from "@/ai/memory/store";
import { count } from "drizzle-orm";
import { messages, sessions } from "@/db/schema";
import { getDb } from "@/db/client";
import os from "node:os";
import process from "node:process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, voice] = await Promise.all([
    getProviderStatus(),
    Promise.resolve(voiceEnginesConfigured()),
  ]);

  const db = getDb();
  const [sessionCount, messageCount, memoryTotal] = await Promise.all([
    db.select({ value: count() }).from(sessions),
    db.select({ value: count() }).from(messages),
    memoryCount(),
  ]);

  const killSwitch = {
    armed: false,
    note: "Destructive actions always require explicit approval. Not currently gating tool execution.",
  };

  return Response.json({
    ok: true,
    name: "Ultron",
    now: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      memoryMb: Math.round(os.totalmem() / 1048576),
      uptimeSec: Math.round(os.uptime()),
      node: process.version,
    },
    db: {
      engine: "libSQL",
      url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
      sessions: sessionCount[0]?.value ?? 0,
      messages: messageCount[0]?.value ?? 0,
      memories: memoryTotal,
    },
    providers,
    voice,
    features: {
      chat: true,
      tools: true,
      memory: true,
      // Realtime live voice is a Phase 1 feature built on top of this base.
      liveVoice: "stub",
      sessions: true,
    },
    killSwitch,
  });
}