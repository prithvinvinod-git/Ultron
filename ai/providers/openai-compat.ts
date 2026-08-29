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
        { id: string; name: string; arguments: string }
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
              name?: string | null;
              arguments?: string | null;
            };
            const index = call.index ?? frames.size;
            const frame =
              frames.get(index) ?? {
                id: call.id ?? "",
                name: call.name ?? "",
                arguments: "",
              };
            if (call.id) frame.id += call.id;
            if (call.name) frame.name += call.name;
            if (call.arguments) frame.arguments += call.arguments;
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
          return {
            id: tc.id ?? "",
            name: fn?.name ?? "",
            arguments: fn?.arguments ?? "",
          };
        }),
        model: completion.model ?? (options?.model ?? config.defaultModel),
        finishReason: choice?.finish_reason ?? "",
      } satisfies Completion;
    },
  };
}