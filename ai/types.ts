export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
  /** Provider-specific opaque token that must be echoed back (Gemini thought_signature). */
  thoughtSignature?: string;
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolParameterSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolFunctionSpec {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  requiresApproval?: boolean;
}

export interface ToolSpec {
  type: "function";
  function: ToolFunctionSpec;
}

/** Wire format shared between client and server for tool calls the agent made. */
export interface ChatEventToolStep {
  toolCallId: string;
  name: string;
  result?: string;
  error?: string;
}

/**
 * Coarse "what is Ultron doing right now" signal. The UI shows it and live
 * voice mode speaks a short acknowledgement for it, so the user is never
 * left in silence while a slow turn is being worked out.
 */
export type ActivityKind =
  | "thinking"
  | "searching"
  | "reading"
  | "generating"
  | "calculating"
  | "remembering"
  | "working";

/** Events streamed over SSE from /api/chat while the agent runs. */
export type ChatEvent =
  | { type: "meta"; provider: string; model: string }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "activity"; activity: ActivityKind; label: string }
  | { type: "tool_start"; toolCallId: string; name: string }
  | { type: "tool_end"; toolCallId: string; name: string; result: string }
  | { type: "tool_error"; toolCallId: string; name: string; error: string }
  | { type: "memory"; summary: string }
  | {
      type: "done";
      content: string | null;
      provider: string;
      model: string;
      rounds: number;
    }
  | { type: "error"; message: string };