import { getPublicToolMetadata } from "@/ai/tools/registry";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const tools = getPublicToolMetadata();
  return Response.json({
    ok: true,
    tools,
    count: tools.length,
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  void body;
  return jsonError(405, "This endpoint is read-only.");
}