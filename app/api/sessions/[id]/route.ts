import { getStore } from "@/db/store";
import { jsonError, storeErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;

  try {
    const store = await getStore();

    const session = await store.getSession(id);
    if (!session) return jsonError(404, "Session not found.");

    // Every returned message is a billed read, and a transcript is append-only,
    // so default to the tail of the conversation rather than the whole history.
    const requested = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Math.min(Math.max(requested || 100, 1), 200);
    const rows = await store.listMessages(id, limit);

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