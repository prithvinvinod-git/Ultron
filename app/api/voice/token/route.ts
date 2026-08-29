import { createRoomToken } from "@/ai/voice/livekit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("room") || `ultron-${Date.now()}`;
  const identity = searchParams.get("identity") || "ultron-user";

  const token = await createRoomToken(roomName, identity);
  if (!token) {
    return jsonError(
      503,
      "LiveKit is not configured. Install the LiveKit CLI and run `lk room join --token ...` after setting LIVEKIT_URL/KEY/SECRET, or use the HTTP TTS/ASR endpoints.",
    );
  }

  return Response.json({ ok: true, ...token, roomName, identity });
}