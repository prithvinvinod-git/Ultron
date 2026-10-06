import { NextResponse } from "next/server";

const AGENT_ID = "agent_3701m49adtbne0vrm1xswtazkat0";

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured." }, { status: 503 });
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(AGENT_ID)}`,
    { headers: { "xi-api-key": apiKey }, cache: "no-store" },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return NextResponse.json(
      { error: `ElevenLabs agent authorization failed (${response.status}).`, detail },
      { status: response.status },
    );
  }

  const data = (await response.json()) as { signed_url?: string };
  if (!data.signed_url) {
    return NextResponse.json({ error: "ElevenLabs returned no signed session URL." }, { status: 502 });
  }

  return NextResponse.json({ signedUrl: data.signed_url });
}
