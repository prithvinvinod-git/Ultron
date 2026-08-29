import "server-only";
import { recallMemories, renderMemories } from "@/ai/memory/store";
import { executeTool, getToolSpecs } from "@/ai/tools/registry";
import { getConfiguredProviders } from "@/ai/providers";
import type { Provider } from "@/ai/providers/types";
import type { ChatEvent, ChatMessage, ToolCall } from "@/ai/types";
import type { Memory } from "@/db/schema";
import { randomUUID } from "node:crypto";

export interface AgentOptions {
  system?: string;
  providerName?: string;
  model?: string;
  sessionId?: string;
  signal?: AbortSignal;
  maxRounds?: number;
}

/**
 * Runs the agent loop: consult persistent memory, stream a provider turn,
 * execute any tool calls it requests, and continue until a final answer.
 * Falls back to the next configured provider if one fails.
 * Yields SSE-shaped ChatEvents.
 */
export async function* runAgent(
  history: ChatMessage[],
  options: AgentOptions = {},
): AsyncGenerator<ChatEvent> {
  const configured = await getConfiguredProviders();
  if (!configured.length) {
    yield {
      type: "error",
      message: "No LLM providers are configured. Add GEMINI_API_KEY or XAI_API_KEY.",
    };
    return;
  }

  const memories = await recallMemories({ sessionId: options.sessionId });
  const systemPrompt = buildSystemPrompt({ system: options.system, memories });
  const conversation: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  const preferredIndex = configured.findIndex(
    (p) => p.config.name === options.providerName,
  );
  const ordered =
    preferredIndex >= 0
      ? [configured[preferredIndex], ...configured.filter((_, i) => i !== preferredIndex)]
      : configured;

  const failures: string[] = [];
  for (const provider of ordered) {
    if (options.signal?.aborted) {
      yield { type: "error", message: "Request aborted." };
      return;
    }
    let retries = 0;
    try {
      for await (const event of runTurn(provider, conversation, options)) {
        if (options.signal?.aborted) break;
        yield event;
      }
      return;
    } catch (err) {
      if (options.signal?.aborted) {
        yield { type: "error", message: "Request aborted." };
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      // Free/rate-limited providers (esp. OpenRouter's shared `:free` pool and
      // Gemini free tier) return transient 429/5xx. Retry once with backoff
      // before falling through to the next provider.
      if (retries === 0 && isTransient(message)) {
        retries++;
        const delayMs = Math.min(parseRetryAfter(message), 12) * 1000;
        await sleep(delayMs);
        try {
          for await (const event of runTurn(provider, conversation, options)) {
            if (options.signal?.aborted) break;
            yield event;
          }
          return;
        } catch (retryErr) {
          const retryMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
          failures.push(`${provider.config.name}: ${retryMessage}`);
        }
      } else {
        failures.push(`${provider.config.name}: ${message}`);
      }
      const isLast = provider === ordered[ordered.length - 1];
      if (isLast) {
        yield {
          type: "error",
          message: `All providers failed. ${failures.join(" | ")}`,
        };
        return;
      }
      // Otherwise try the next provider with the same conversation state.
    }
  }

  yield { type: "error", message: "No providers could process the request." };
}

/**
 * Drives a single provider through repeated tool rounds: streams text from the
 * model, executes requested tool calls, feeds results back, and finally emits
 * a "done" event with the model's concluding text.
 */
async function* runTurn(
  provider: Provider,
  conversation: ChatMessage[],
  options: AgentOptions,
): AsyncGenerator<ChatEvent> {
  const maxRounds = options.maxRounds ?? 6;
  let content: string | null = null;

  yield {
    type: "meta",
    provider: provider.config.name,
    model: options.model ?? provider.config.defaultModel,
  };

  for (let round = 0; round < maxRounds; round++) {
    const gen = provider.stream(conversation, {
      tools: getToolSpecs(),
      model: options.model,
      signal: options.signal,
    });

    let step = await gen.next();
    while (!step.done) {
      const event = step.value;
      if (event.type === "text") yield { type: "text", text: event.text };
      else if (event.type === "reasoning")
        yield { type: "reasoning", text: event.text };
      step = await gen.next();
    }

    const completion = step.value;
    const model = completion.model;
    content = completion.content ?? content;

    const toolCalls: ToolCall[] = completion.toolCalls ?? [];
    if (!toolCalls.length) {
      yield {
        type: "done",
        content,
        provider: provider.config.name,
        model,
        rounds: round + 1,
      };
      return;
    }

    conversation.push({ role: "assistant", content, toolCalls });
    for (const toolCall of toolCalls) {
      const toolCallId = toolCall.id || randomUUID();
      yield { type: "tool_start", toolCallId, name: toolCall.name };

      let resultText: string;
      try {
        resultText = await executeTool(toolCall.name, toolCall.arguments);
        yield {
          type: "tool_end",
          toolCallId,
          name: toolCall.name,
          result: resultText,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        resultText = `Tool error: ${message}`;
        yield {
          type: "tool_error",
          toolCallId,
          name: toolCall.name,
          error: message,
        };
      }

      conversation.push({ role: "tool", toolCallId, content: resultText });
    }
  }

  yield {
    type: "done",
    content,
    provider: provider.config.name,
    model: options.model ?? provider.config.defaultModel,
    rounds: maxRounds,
  };
}

function buildSystemPrompt(opts: { system?: string; memories: Memory[] }): string {
  const base =
    opts.system ??
    `You are Ultron, the user's personal agentic assistant — a JARVIS-style AI that is witty, precise, and genuinely helpful. You can use tools to compute things, check the current time, search your long-term memory, persist memories, and search the web. You stay in character, keep your style light and modern, and never invent facts when you can check a tool instead.

Current time: ${new Date().toString()}`;

  return `${base}

KEY MEMORIES:
${renderMemories(opts.memories)}
`;
}

/** Transient rate-limit / server errors worth a single retry. */
function isTransient(message: string): boolean {
  return /\b(429|5\d\d)\b|Provider returned error|upstream_|\bresource_exhausted\b|quota exceeded.*retr/i.test(
    message,
  );
}

/** Reads a retry hint from provider error payloads; defaults to 5s. */
function parseRetryAfter(message: string): number {
  const sec = message.match(/retry_after_seconds?["\s:]+(\d+)/i);
  if (sec) return Math.max(1, Number(sec[1]));
  const header = message.match(/["']?Retry-After["']?["\s:]+(\d+)/i);
  if (header) return Math.max(1, Number(header[1]));
  const retry = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (retry) return Math.max(1, Math.ceil(Number(retry[1])));
  return 5;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}