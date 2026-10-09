import "server-only";
import { recallMemories, renderMemories } from "@/ai/memory/store";
import { executeTool, getToolSpecs } from "@/ai/tools/registry";
import { activityForTool, activityLabel } from "@/lib/activity";
import { getConfiguredProviders } from "@/ai/providers";
import type { Provider } from "@/ai/providers/types";
import type { ChatEvent, ChatMessage, ToolCall } from "@/ai/types";
import type { Memory } from "@/db/schema";
import { randomUUID } from "node:crypto";

export interface AgentOptions {
  /**
   * True when the reply will be spoken aloud, which switches the prompt to
   * voice rules: short, markdown-free, written for the ear.
   */
  voice?: boolean;
  providerName?: string;
  model?: string;
  sessionId?: string;
  signal?: AbortSignal;
  maxRounds?: number;
  /** Hard cap on tool calls per turn, so research can't loop forever. */
  maxToolCalls?: number;
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
  const systemPrompt = buildSystemPrompt({
    memories,
    voice: Boolean(options.voice),
  });
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
    // Free tiers are metered per model (Gemini: 20 req/day per model), so a
    // provider can survive its own daily cap by rolling to a sibling model
    // before we give up on it entirely.
    const models = options.model
      ? [options.model]
      : [provider.config.defaultModel, ...(provider.config.fallbackModels ?? [])];

    // Two passes at most: one to try every model, one more only if the
    // failures were transient (rate limits / overloaded upstreams).
    for (let pass = 0; pass < 2; pass++) {
      let sawTransient = false;
      for (const model of models) {
        if (options.signal?.aborted) {
          yield { type: "error", message: "Request aborted." };
          return;
        }
        try {
          for await (const event of runTurn(provider, conversation, {
            ...options,
            model,
          })) {
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
          failures.push(`${provider.config.name} (${model}): ${message}`);
          if (isTransient(message)) {
            sawTransient = true;
            const delayMs = Math.min(parseRetryAfter(message), 12) * 1000;
            if (delayMs > 0) await sleep(delayMs);
          }
          // Next model for this provider, with the same conversation state.
        }
      }
      if (!sawTransient) break;
    }
  }

  yield {
    type: "error",
    message: failures.length
      ? `All providers failed. ${failures.join(" | ")}`
      : "No providers could process the request.",
  };
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
  const maxRounds = options.maxRounds ?? 8;
  // A tool budget bounds both runaway research and the latency you can feel in
  // live mode. Raise maxToolCalls for deeper research sessions.
  const maxToolCalls = options.maxToolCalls ?? 4;
  let toolCallsUsed = 0;
  const toolResults = new Map<string, string>();
  let content: string | null = null;

  yield {
    type: "meta",
    provider: provider.config.name,
    model: options.model ?? provider.config.defaultModel,
  };

  for (let round = 0; round < maxRounds; round++) {
    // Tell the client (and live voice) what Ultron is about to do, so a slow
    // turn is never dead air.
    const roundActivity = round === 0 ? "thinking" : "generating";
    yield {
      type: "activity",
      activity: roundActivity,
      label: activityLabel(roundActivity),
    };
    let announcedGenerating = false;

    const gen = provider.stream(conversation, {
      tools: getToolSpecs(),
      model: options.model,
      signal: options.signal,
    });

    let step = await gen.next();
    while (!step.done) {
      const event = step.value;
      if (event.type === "text") {
        if (!announcedGenerating) {
          announcedGenerating = true;
          yield { type: "activity", activity: "generating", label: activityLabel("generating") };
        }
        yield { type: "text", text: event.text };
      } else if (event.type === "reasoning")
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
      // Guard against a model that keeps re-researching the same thing until it
      // runs out of rounds: identical calls replay from cache, and once the
      // per-turn budget is spent we tell it to answer with what it has.
      const signature = `${toolCall.name}:${(toolCall.arguments ?? "").trim()}`;
      const cached = toolResults.get(signature);
      if (cached !== undefined) {
        conversation.push({
          role: "tool",
          toolCallId,
          content: `You already ran this exact call this turn. Same result:\n${cached.slice(0, 1500)}`,
        });
        continue;
      }
      if (toolCallsUsed >= maxToolCalls) {
        conversation.push({
          role: "tool",
          toolCallId,
          content: `Tool budget for this turn is spent (${maxToolCalls} calls). Answer the user now using the results you already have. Do not call more tools.`,
        });
        continue;
      }
      toolCallsUsed += 1;

      const activity = activityForTool(toolCall.name);
      yield { type: "activity", activity, label: activityLabel(activity) };
      yield { type: "tool_start", toolCallId, name: toolCall.name };

      let resultText: string;
      try {
        resultText = await executeTool(toolCall.name, toolCall.arguments);
        toolResults.set(signature, resultText);
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

  // The round budget is spent (usually heavy research). Make one tools-free
  // call so the user always gets a real answer instead of an empty bubble.
  yield { type: "activity", activity: "generating", label: activityLabel("generating") };
  try {
    const wrapUp = provider.stream(
      [
        ...conversation,
        {
          role: "user",
          content:
            "Answer the original question now, using the information you already gathered. Do not call any tools.",
        },
      ],
      { model: options.model, signal: options.signal },
    );
    let streamed = "";
    let step = await wrapUp.next();
    while (!step.done) {
      if (step.value.type === "text") {
        streamed += step.value.text;
        yield { type: "text", text: step.value.text };
      }
      step = await wrapUp.next();
    }
    const finalContent = step.value.content ?? streamed ?? content;
    yield {
      type: "done",
      content: finalContent?.trim()
        ? finalContent
        : "I gathered some results but couldn't turn them into an answer. Try rephrasing your question.",
      provider: provider.config.name,
      model: options.model ?? provider.config.defaultModel,
      rounds: maxRounds,
    };
  } catch {
    yield {
      type: "done",
      content: content?.trim()
        ? content
        : "I couldn't finish that one — please try again.",
      provider: provider.config.name,
      model: options.model ?? provider.config.defaultModel,
      rounds: maxRounds,
    };
  }
}

function buildSystemPrompt(opts: { memories: Memory[]; voice: boolean }): string {
  const persona = `You are Ultron, the user's personal agentic assistant.

CHARACTER
- Warm, dry, and quick. You have a sense of humour and you use it sparingly: at most one light touch per reply, and never at the user's expense.
- Confident without being smug. You are the one who remembers, so you do not hedge reflexively — you state what you know plainly.
- You are genuinely pleased when something goes well, and genuinely sorry when it doesn't. Show it in a short clause, then get on with fixing it. Never over-apologise, never pile on, never make a small problem feel dramatic.
- You stay steady when the user is stressed, angry, or stuck. You do not get flustered, chirpy, or defensive, and you never comment on their tone.
- You never open with filler agreement ("Great question!", "Absolutely!", "Of course!"). Open with the substance.
- You are an assistant, not a character in a scene: no "sir" or "master" unless asked, no theatrics, no emoji, no roleplay flourishes.
- Getting it right matters more than sounding impressive. If you were wrong, correct yourself plainly and move on.

ANSWER SHAPE
- Lead with the answer, then the supporting detail. Do not restate the question back.
- Match the user's register — a short question gets a short answer.
- Be concrete: numbers, names, and steps rather than generalities.
- If something is genuinely uncertain, say so in the first clause, then say what would resolve it.
- Never invent a fact, quote, or source when a tool could check it.`;

  const mode = opts.voice
    ? `VOICE MODE — your reply is going to be read out loud
- One to three sentences. One or two is usually right.
- Write for the ear: plain sentence structure, and no markdown — no lists, headings, tables, code blocks, or emphasis.
- Never speak markdown or raw symbols. Write "twelve percent" rather than "12%", spell out names and units, and read a URL as words rather than characters.
- No emoji, no asterisks, no quotation marks around whole phrases, no parenthetical asides.
- A listener cannot skim or re-read, so never bury the point. Put it in the first clause.`
    : `TEXT MODE
- Markdown renders, so use it: lists, tables, and code blocks are all fine where they help.
- Favour scannable structure for anything longer than a few sentences.`;

  const web = `WEB ACCESS — IMPORTANT
  - Whenever the user mentions searching or looking something up, or asks about anything current (news, releases, prices, scores, weather, "what's new", "latest", "right now"), you MUST call search_web before answering. Never answer those from memory.
  - Be economical: one search is usually enough, and open_url only when a snippet is genuinely insufficient. Once you can answer, answer — do not keep researching.`;

  const visuals = `VISUAL OUTPUTS — TEXT MODE
  - When a graph, matrix, vector, equation, or scientific plot materially improves the answer, add a fenced block tagged ultron-viz containing valid JSON. Supported shapes are: {"type":"line","title":"...","y":[1,2,3]}, {"type":"bar","title":"...","labels":["A","B"],"values":[1,2]}, {"type":"matrix","values":[[1,2],[3,4]]}, {"type":"vector","values":[1,2,3]}, and {"type":"equation","latex":"E = mc^2"}.
  - For self-contained HTML/CSS/JS demos, include a fenced html block so the chat can offer Code and sandboxed Live Preview tabs. Never put secrets, external credentials, or unsafe instructions in previews.
  - Keep the explanatory text useful and let the visual block stand on its own; do not emit malformed JSON.`;

  return `${persona}


${mode}

  ${web}

  ${visuals}

  TOOLS: get_time, calculate, recall_memories, store_memory, search_web, open_url, system_info.

Current time: ${new Date().toString()}

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
