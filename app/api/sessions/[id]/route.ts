import { getStore } from "@/db/store";
import { jsonError, storeErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;

  try {
    const store = await getStore();

    const session = await store.getSession(id);
    if (!session) return jsonError(404, "Session not found.");

    const rows = await store.listMessages(id);

    const transcript = rows
      .map((m) => {
        if (m.role === "user" || m.role === "assistant") {
          return { role: m.role, content: m.content ?? "" };
        }
        return null;
      })
      .filter((m): m is { role: string; content: string } => m !== null);

    return Response.json({
      ok: true,
      session,
      messages: transcript,
    });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  try {
    await (await getStore()).deleteSession(id);
    return Response.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}