import { getStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  const sessions = await store.listSessionsWithCounts(50);
  return Response.json({ ok: true, sessions });
}

export async function POST(request: Request) {
  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const id = randomUUID();
  const title = (body.title ?? "New conversation").slice(0, 100);
  await (await getStore()).createSession({ id, title });

  return Response.json({ ok: true, session: { id, title } }, { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "id query param required.");
  await (await getStore()).deleteSession(id);
  return Response.json({ ok: true });
}