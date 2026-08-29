import { count, desc, eq } from "drizzle-orm";
import { messages, sessions } from "@/db/schema";
import { getDb } from "@/db/client";
import { randomUUID } from "node:crypto";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();
  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      messageCount: count(messages.id),
    })
    .from(sessions)
    .leftJoin(messages, eq(messages.sessionId, sessions.id))
    .groupBy(sessions.id)
    .orderBy(desc(sessions.updatedAt))
    .limit(50);

  return Response.json({ ok: true, sessions: rows });
}

export async function POST(request: Request) {
  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const db = getDb();
  const id = randomUUID();
  const title = (body.title ?? "New conversation").slice(0, 100);
  await db.insert(sessions).values({ id, title });

  return Response.json(
    { ok: true, session: { id, title } },
    { status: 201 },
  );
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "id query param required.");
  const db = getDb();
  await db.delete(sessions).where(eq(sessions.id, id));
  return Response.json({ ok: true });
}