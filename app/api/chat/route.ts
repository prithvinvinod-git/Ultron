import { runAgent } from "@/ai/agent";
import { getStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import { SSE_HEADERS, jsonError, sseEncode } from "@/lib/http";
import type { ChatMessage } from "@/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function truncate(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export async function POST(request: Request) {
  let body: {
    sessionId?: string;
    messages?: unknown[];
    provider?: string;
    model?: string;
    system?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }

  const history = ((body.messages ?? []) as ChatMessage[]).filter(
    (m) => m.role === "user" || m.role === "assistant",
  );
  if (!history.length) {
    return jsonError(400, "No chat messages provided.");
  }

  const store = await getStore();
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  let sessionId = body.sessionId;
  let isNewSession = false;

  if (sessionId) {
    const existing = await store.getSession(sessionId);
    if (!existing) {
      isNewSession = true;
      await store.createSession({
        id: sessionId,
        title: truncate(lastUser?.content ?? "New conversation"),
      });
    }
  } else {
    isNewSession = true;
    sessionId = randomUUID();
    await store.createSession({
      id: sessionId,
      title: truncate(lastUser?.content ?? "New conversation"),
    });
  }

  if (lastUser?.content) {
    await store.insertMessage({
      id: randomUUID(),
      sessionId,
      role: "user",
      content: lastUser.content,
    });
  }

  const signal = new AbortController();
  request.signal.addEventListener(
    "abort",
    () => signal.abort(),
    { once: true },
  );

  let finalContent: string | null = null;
  let finalProvider = "";
  let finalModel = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of runAgent(history, {
          sessionId,
          signal: signal.signal,
          providerName: body.provider,
          model: body.model,
          system: body.system,
        })) {
          controller.enqueue(sseEncode(event));
          if (event.type === "done") {
            finalContent = event.content;
            finalProvider = event.provider;
            finalModel = event.model;
          }
        }
      } catch (err) {
        controller.enqueue(
          sseEncode({
            type: "error",
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        if (finalContent !== null) {
          await store.insertMessage({
            id: randomUUID(),
            sessionId,
            role: "assistant",
            content: finalContent ?? "",
            provider: finalProvider || null,
            model: finalModel || null,
          });
          if (isNewSession) {
            await store.touchSession(sessionId, {
              title: truncate(
                finalContent || (lastUser?.content ?? "New conversation"),
              ),
            });
          } else {
            await store.touchSession(sessionId, {});
          }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}