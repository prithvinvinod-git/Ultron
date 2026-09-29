import { availableVoices } from "@/ai/voice/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const voices = availableVoices().map((v) => ({
    key: v.key,
    engine: v.engine,
    name: v.name,
    gender: v.gender,
    locale: v.locale,
    accent: v.accent,
    note: v.note,
  }));
  return Response.json({ voices });
}
