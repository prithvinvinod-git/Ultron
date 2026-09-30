import { getStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import { jsonError, storeErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await getStore();
    // Each returned document is a billed read, so the list is deliberately
    // short — the sidebar only ever shows a "recent" handful.
    const sessions = await store.listSessionsWithCounts(20);
    return Response.json({ ok: true, sessions });
  } catch (err) {
    return storeErrorResponse(err);
  }
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
  try {
    await (await getStore()).createSession({ id, title });
    return Response.json({ ok: true, session: { id, title } }, { status: 201 });
  } catch (err) {
    return storeErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return jsonError(400, "id query param required.");
  try {
    await (await getStore()).deleteSession(id);
    return Response.json({ ok: true });
  } catch (err) {
    return storeErrorResponse(err);
  }
}