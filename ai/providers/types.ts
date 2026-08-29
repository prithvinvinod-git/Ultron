import type { ChatMessage, ToolCall, ToolSpec } from "@/ai/types";

export interface ProviderConfig {
  /** Stable key, e.g. "gemini" | "xai" | "openrouter". */
  name: string;
  label: string;
  baseURL: string;
  apiKey: string;
  defaultModel: string;
  docs?: string;
}

export interface ChatOptions {
  model?: string;
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface Completion {
  content: string | null;
  toolCalls: ToolCall[];
  model: string;
  finishReason: string;
}

export interface ToolStreamUpdate {
  index: number;
  id: string;
  name: string;
  arguments: string;
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; toolCall: ToolStreamUpdate };

/**
 * A pluggable LLM provider. Both Gemini (OpenAI-compatible endpoint) and
 * Grok (OpenAI-compatible endpoint) implement the same shape, so adding
 * OpenRouter or any other OpenAI-compatible service is a config change.
 */
export interface Provider {
  readonly config: ProviderConfig;
  stream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<StreamEvent, Completion, void>;
  complete(messages: ChatMessage[], options?: ChatOptions): Promise<Completion>;
}