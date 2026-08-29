import { asc, eq } from "drizzle-orm";
import { messages, sessions } from "@/db/schema";
import { getDb } from "@/db/client";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const db = getDb();

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, id))
    .limit(1);
  if (!session.length) return jsonError(404, "Session not found.");

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));

  const transcript = rows.map((m) => {
    if (m.role === "user" || m.role === "assistant") {
      return { role: m.role, content: m.content ?? "" };
    }
    return null;
  });

  return Response.json({
    ok: true,
    session: session[0],
    messages: transcript.filter(Boolean),
  });
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/sessions/[id]">,
) {
  const { id } = await ctx.params;
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, id));
  return Response.json({ ok: true });
}