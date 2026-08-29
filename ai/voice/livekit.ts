import "server-only";
import { AccessToken } from "livekit-server-sdk";

export const LIVEKIT_URL = process.env.LIVEKIT_URL;

/**
 * Issues a short-lived room join token for a LiveKit room (used as the
 * transport for realtime voice). Returns null when no LiveKit cloud
 * credentials are configured; the voice client then relies on direct
 * HTTP STT/TTS or the browser's Web Speech API.
 */
export async function createRoomToken(
  roomName: string,
  identity: string,
): Promise<{ token: string; url: string } | null> {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret || !LIVEKIT_URL) return null;

  const accessToken = new AccessToken(apiKey, apiSecret, {
    identity,
    ttl: "30m",
  });
  accessToken.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
  });

  return { token: await accessToken.toJwt(), url: LIVEKIT_URL };
}