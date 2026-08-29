import { getProviderStatus } from "@/ai/providers";
import { voiceEnginesConfigured } from "@/ai/voice/speech";
import { getStore } from "@/db/store";
import os from "node:os";
import process from "node:process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [providers, voice, store] = await Promise.all([
    getProviderStatus(),
    Promise.resolve(voiceEnginesConfigured()),
    getStore(),
  ]);

  const [sessionCount, messageCount, memoryTotal] = await Promise.all([
    store.countSessions(),
    store.countMessagesAll(),
    store.memoryCount(),
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
      engine: store.engine,
      store: store.engine === "firestore" ? "Firebase Cloud Firestore" : "libSQL",
      url:
        store.engine === "firestore"
          ? (process.env.FIREBASE_PROJECT_ID ?? "firebase-project")
          : (process.env.TURSO_DATABASE_URL ?? "file:local.db"),
      sessions: sessionCount,
      messages: messageCount,
      memories: memoryTotal,
    },
    providers,
    voice,
    features: {
      chat: true,
      tools: true,
      memory: true,
      liveVoice: "live",
      sessions: true,
    },
    killSwitch,
  });
}