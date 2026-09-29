import OpenAI from "openai";
import type { ChatMessage } from "@/ai/types";
import type {
  ChatOptions,
  Completion,
  Provider,
  ProviderConfig,
  StreamEvent,
} from "@/ai/providers/types";

type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * Parses a comma-separated model fallback list from the environment, dropping
 * blanks and the default model (which is always tried first).
 */
export function parseModelList(
  raw: string | undefined,
  exclude?: string,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m !== exclude);
}

export function toOpenAIMessage(message: ChatMessage): OpenAIMessage {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content ?? "" };
    case "user":
      return { role: "user", content: message.content ?? "" };
    case "assistant":
      return {
        role: "assistant",
        content: message.content,
        tool_calls: message.toolCalls?.length
          ? message.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: tc.arguments },
              // Gemini requires the thought_signature echoed back on function
              // call parts. Only ever present on Gemini tool calls; other
              // OpenAI-compatible providers ignore it.
              ...(tc.thoughtSignature
                ? {
                    extra_content: {
                      google: { thought_signature: tc.thoughtSignature },
                    },
                  }
                : {}),
            }))
          : undefined,
      };
    case "tool":
      return {
        role: "tool",
        tool_call_id: (message.toolCallId ?? "") as string,
        content: message.content ?? "",
      };
    default:
      return { role: "user", content: message.content ?? "" } as OpenAIMessage;
  }
}

function mapToolSpecs(tools?: ChatOptions["tools"]) {
  return tools?.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    },
  }));
}

/**
 * Builds a Provider backed by the OpenAI SDK pointed at any
 * OpenAI-compatible endpoint (Gemini, xAI/Grok, OpenRouter, ...
 * and even a local vLLM/Ollama server).
 */
export function createOpenAICompatProvider(config: ProviderConfig): Provider {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });

  function optionsFor(options?: ChatOptions) {
    return {
      model: options?.model ?? config.defaultModel,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      tools: mapToolSpecs(options?.tools),
      stream: true as const,
    };
  }

  return {
    config,

    async *stream(messages, options) {
      const stream = await client.chat.completions.create(
        {
          ...optionsFor(options),
          messages: messages.map(toOpenAIMessage),
        },
        { signal: options?.signal },
      );

      const frames = new Map<
        number,
        { id: string; name: string; arguments: string; thoughtSignature?: string }
      >();
      let content = "";

      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        const reasoning = (delta as { reasoning_content?: string })
          .reasoning_content;
        if (reasoning) {
          yield { type: "reasoning", text: reasoning } satisfies StreamEvent;
        }

        if (typeof delta.content === "string" && delta.content) {
          content += delta.content;
          yield { type: "text", text: delta.content } satisfies StreamEvent;
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            const call = tc as {
              index?: number | null;
              id?: string | null;
              function?: {
                name?: string | null;
                arguments?: string | null;
              } | null;
              extra_content?: {
                google?: { thought_signature?: string | null };
              } | null;
            };
            const index = call.index ?? frames.size;
            const frame = frames.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            // id/name arrive once (typically the first frame); arguments stream
            // as JSON fragments across frames.
            if (call.id) frame.id = call.id;
            if (call.function?.name) frame.name = call.function.name;
            if (call.function?.arguments)
              frame.arguments += call.function.arguments;
            const signature =
              call.extra_content?.google?.thought_signature ?? frame.thoughtSignature;
            if (signature) frame.thoughtSignature = signature;
            frames.set(index, frame);
            yield {
              type: "tool",
              toolCall: { index, ...frame },
            } satisfies StreamEvent;
          }
        }
      }

      const toolCalls = [...frames.values()].map((frame) => ({
        id: frame.id,
        name: frame.name,
        arguments: frame.arguments,
        thoughtSignature: frame.thoughtSignature,
      }));

      return {
        content: content || null,
        toolCalls,
        model: options?.model ?? config.defaultModel,
        finishReason: "stop",
      } satisfies Completion;
    },

    async complete(messages, options) {
      const completion = await client.chat.completions.create(
        {
          ...optionsFor(options),
          stream: false,
          messages: messages.map(toOpenAIMessage),
        },
        { signal: options?.signal },
      );

      const choice = completion.choices?.[0];
      const msg = choice?.message;
      return {
        content: msg?.content ?? null,
        toolCalls: (msg?.tool_calls ?? []).map((tc) => {
          const fn = (tc as { function?: { name?: string; arguments?: string | null } })
            .function;
          const sig = (
            tc as {
              extra_content?: { google?: { thought_signature?: string | null } };
            }
          ).extra_content?.google?.thought_signature;
          return {
            id: tc.id ?? "",
            name: fn?.name ?? "",
            arguments: fn?.arguments ?? "",
            thoughtSignature: sig ?? undefined,
          };
        }),
        model: completion.model ?? (options?.model ?? config.defaultModel),
        finishReason: choice?.finish_reason ?? "",
      } satisfies Completion;
    },
  };
}