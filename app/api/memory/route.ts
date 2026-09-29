import { deleteMemory, listMemories, saveMemory } from "@/ai/memory/store";
import { jsonError, storeErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
  try {
    const rows = await listMemories(limit);
    return Response.json({
      ok: true,
      memories: rows.map((m) => ({
        ...m,
        tags: safeParseTags(m.tags),
      })),
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

function safeParseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  let body: {
    summary?: string;
    detail?: string;
    kind?: string;
    tags?: string[];
    importance?: number;
    scope?: string;
    sessionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const summary = (body.summary ?? "").trim();
  if (!summary) return jsonError(400, "summary is required.");

  try {
    const stored = await saveMemory({
      summary,
      detail: body.detail?.trim() ?? "",
      kind: body.kind ?? "fact",
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      importance:
        typeof body.importance === "number"
          ? Math.max(1, Math.min(5, body.importance))
          : 1,
      scope: body.scope ?? "global",
      sessionId: body.sessionId,
    });

    return Response.json(
      { ok: true, memory: { ...stored, tags: safeParseTags(stored.tags) } },
      { status: 201 },
    );
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "id query param required.");
  try {
    const deleted = await deleteMemory(id);
    if (!deleted) return jsonError(404, "Memory not found.");
    return Response.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}