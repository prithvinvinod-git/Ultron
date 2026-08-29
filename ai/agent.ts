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

  for (const provider of ordered) {
    if (options.signal?.aborted) {
      yield { type: "error", message: "Request aborted." };
      return;
    }
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
      const isLast = provider === ordered[ordered.length - 1];
      if (isLast) {
        yield { type: "error", message: `All providers failed: ${message}` };
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