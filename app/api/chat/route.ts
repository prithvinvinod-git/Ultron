import { publishEspResponse } from '@/ai/esp/broadcast';
import { runAgent } from "@/ai/agent";
import { getConfiguredProviders } from "@/ai/providers";
import { tryStore } from "@/db/store";
import { randomUUID } from "node:crypto";
import { SSE_HEADERS, jsonError, sseEncode } from "@/lib/http";
import type { ChatMessage } from "@/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function truncate(text: string, max = 48): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

async function generateSessionTitle(
  userMessage: string,
  assistantMessage: string,
  preferredProvider?: string,
): Promise<string | null> {
  const providers = await getConfiguredProviders();
  const ordered = preferredProvider
    ? [
        ...providers.filter((provider) => provider.config.name === preferredProvider),
        ...providers.filter((provider) => provider.config.name !== preferredProvider),
      ]
    : providers;

  for (const provider of ordered) {
    try {
      const completion = await provider.complete(
        [
          {
            role: "system",
            content:
              "Create a concise conversation title from the exchange. Return only the title, with no quotes, punctuation at the end, or explanation. Use 3 to 6 words and capture the topic rather than copying the user's sentence.",
          },
          {
            role: "user",
            content: `User: ${userMessage.slice(0, 1200)}\\nAssistant: ${assistantMessage.slice(0, 1800)}`,
          },
        ],
        { model: provider.config.defaultModel, temperature: 0.2, maxTokens: 20 },
      );
      const title = completion.content
        ?.replace(/^['"“”]+|['"“”]+$/g, "")
        .replace(/[.!?]+$/, "")
        .replace(/\\s+/g, " ")
        .trim();
      if (title) return truncate(title, 72);
    } catch {
      // A title is optional; the completed chat should never fail because of it.
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: {
    sessionId?: string;
    messages?: unknown[];
    provider?: string;
    model?: string;
    /** The reply will be spoken aloud, so the agent answers in voice mode. */
    voice?: boolean;
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

  // Persistence is best-effort. If the store is unavailable (Firestore quota
  // exhausted, bad credentials) the turn must still answer and stream — it just
  // goes unpersisted.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const sessionId = body.sessionId ?? randomUUID();
  const title = truncate(lastUser?.content ?? "New conversation");

  // A stored id that no longer resolves (or a fresh one) still needs creating.
  const isNewSession = await tryStore(
    (store) => store.getSession(sessionId).then((s) => s === null),
    true,
  );

  await tryStore(async (store) => {
    if (isNewSession) {
      await store.createSession({ id: sessionId, title });
    }
    if (lastUser?.content) {
      await store.insertMessage({
        id: randomUUID(),
        sessionId,
        role: "user",
        content: lastUser.content,
      });
    }
  }, undefined);

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
          voice: body.voice,
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
          try { publishEspResponse(finalContent, sessionId); } catch (e) {}
          const generatedTitle =
            isNewSession && lastUser?.content
              ? await generateSessionTitle(
                  lastUser.content,
                  finalContent,
                  body.provider,
                )
              : null;

          await tryStore(async (store) => {
            await store.insertMessage({
              id: randomUUID(),
              sessionId,
              role: "assistant",
              content: finalContent ?? "",
              provider: finalProvider || null,
              model: finalModel || null,
            });
            await store.touchSession(sessionId, {
              title: isNewSession
                ? generatedTitle ?? truncate(lastUser?.content ?? "New conversation")
                : undefined,
            });
          }, undefined);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
