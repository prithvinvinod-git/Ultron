import "server-only";
import { tryStore } from "@/db/store";
import { getProviderStatus } from "@/ai/providers";
import { memoryCount, recallMemories, saveMemory } from "@/ai/memory/store";
import { formatResults, readPage, searchWeb } from "@/ai/tools/web-search";
import type { ToolSpec } from "@/ai/types";
import os from "node:os";
import process from "node:process";

export interface ToolExecutor {
  (args: Record<string, unknown>): Promise<string> | string;
}

interface ToolDefinition extends ToolSpec {
  execute: ToolExecutor;
}

const TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_time",
      description:
        "Get the current date and time in the user's local timezone. Use it whenever the user asks what time/day it is or how long until something.",
      parameters: { type: "object", properties: {} },
    },
    execute: () => new Date().toString(),
  },
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "Safely evaluate an arithmetic expression using + - * / ( ) % and ^. Returns a number. Never used for anything but pure math.",
      parameters: {
        type: "object",
        required: ["expression"],
        properties: {
          expression: {
            type: "string",
            description: "Arithmetic expression, e.g. '(1984 * 3) / 2'",
          },
        },
      },
    },
    execute: (args) => String(safeEvaluate(String(args.expression ?? ""))),
  },
  {
    type: "function",
    function: {
      name: "recall_memories",
      description:
        "Search Ultron's persistent long-term memory (facts, preferences, decisions, past answers) about the user or a topic. Call this before answering anything that may depend on the user's history.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "What to look for, e.g. 'coding preferences'." },
          limit: { type: "number", description: "Max memories to return (default 8)." },
        },
      },
    },
    execute: async (args) => {
      const limit = Number(args.limit) || 8;
      const rows = await recallMemories({
        query: String(args.query ?? ""),
        limit,
      });
      return rows.length
        ? rows
            .map((m) => `[${m.kind}] ${m.summary}${m.detail ? ` — ${m.detail}` : ""}`)
            .join("\n")
        : "No matching memories found.";
    },
  },
  {
    type: "function",
    function: {
      name: "store_memory",
      description:
        "Persist an important fact, preference, or decision to Ultron's long-term memory so it is remembered across conversations. Use silently when the user shares anything worth keeping.",
      parameters: {
        type: "object",
        required: ["summary"],
        properties: {
          summary: { type: "string", description: "One-line statement of the memory." },
          detail: { type: "string", description: "Optional supporting detail." },
          kind: {
            type: "string",
            enum: ["fact", "preference", "decision"],
            description: "Memory category (default 'fact').",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Optional tags to aid later recall.",
          },
        },
      },
    },
    execute: async (args) => {
      const stored = await saveMemory({
        summary: String(args.summary),
        detail: args.detail ? String(args.detail) : "",
        kind: args.kind ? String(args.kind) : "fact",
        tags: Array.isArray(args.tags)
          ? args.tags.map(String)
          : [],
      });
      return `Stored memory: ${stored.summary} (${stored.kind})`;
    },
  },
  {
    type: "function",
    function: {
      name: "search_web",
      description:
        "Search the real web for current information (news, prices, docs, anything that changes). ALWAYS call this instead of guessing whenever the user asks about current events, recent releases, scores, weather, prices, or says things like 'search the web', 'look it up', 'check online', or 'what's happening with X'. Then use open_url to read the most promising result.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search query." },
        },
      },
    },
    execute: async (args) => {
      const query = String(args.query ?? "");
      const results = await searchWeb(query);
      return formatResults(query, results);
    },
  },
  {
    type: "function",
    function: {
      name: "open_url",
      description:
        "Fetch a web page and return its readable text. Use it after search_web to read the full content of a specific result before answering.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "Absolute URL to read." },
        },
      },
    },
    execute: async (args) => readPage(String(args.url ?? "")),
  },
  {
    type: "function",
    function: {
      name: "system_info",
      description:
        "Report the host OS, CPU/RAM, Node runtime, database size, and which AI providers / voice services are configured.",
      parameters: { type: "object", properties: {} },
    },
    execute: async () => {
      const [providers, memories] = await Promise.all([
        getProviderStatus(),
        memoryCount(),
      ]);
      const dbMeta = await tryStore(
        async (store) => {
          const [sessions, messages] = await Promise.all([
            store.countSessions(),
            store.countMessagesAll(),
          ]);
          return {
            engine: store.engine,
            sessions,
            messages,
            memories,
          };
        },
        { engine: "unavailable", sessions: 0, messages: 0, memories },
      );
      return JSON.stringify(
        {
          host: {
            platform: os.platform(),
            arch: os.arch(),
            release: os.release(),
            hostname: os.hostname(),
            cpus: os.cpus().length,
            memoryMb: Math.round(os.totalmem() / 1048576),
            uptimeSec: Math.round(os.uptime()),
          },
          runtime: { node: process.version, pid: process.pid },
          db: dbMeta,
          providers: providers.map((p) => ({
            name: p.name,
            configured: p.configured,
            active: p.active,
            model: p.defaultModel,
          })),
          voice: {
            tts: ["livekit", "groq"].filter((k) => isVoiceConfigured(k as "livekit" | "groq")),
            stt: ["groq"].filter((k) => isVoiceConfigured(k as "livekit" | "groq")),
          },
        },
        null,
        2,
      );
    },
  },
];

function isVoiceConfigured(service: "livekit" | "groq"): boolean {
  if (service === "groq") return Boolean(process.env.GROQ_API_KEY);
  return Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET);
}

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.function.name, t]));

/** Tool metadata exposed to the model for function calling. */
export function getToolSpecs(): ToolSpec[] {
  return TOOLS.map((t) => ({ type: t.type, function: t.function }));
}

/** Public metadata for the /tools page (no executors, no agent context). */
export function getPublicToolMetadata() {
  return TOOLS.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameters: t.function.parameters as Record<string, unknown>,
    requiresApproval: Boolean(t.function.requiresApproval),
  }));
}

export async function executeTool(
  name: string,
  argumentsJson: string,
): Promise<string> {
  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) throw new Error(`Unknown tool "${name}".`);
  let args: Record<string, unknown> = {};
  if (argumentsJson) {
    try {
      const parsed = JSON.parse(argumentsJson);
      if (parsed && typeof parsed === "object") args = parsed;
    } catch {
      throw new Error(`Tool "${name}" received invalid JSON arguments.`);
    }
  }
  const result = await tool.execute(args);
  return typeof result === "string" ? result : JSON.stringify(result);
}

function safeEvaluate(expression: string): number {
  const cleaned = String(expression).replace(/[^0-9+\-*/().%^]/g, "");
  if (!cleaned.trim()) throw new Error("Empty expression.");
  const source = cleaned.replace(/\^/g, "**");
  const result = new Function(`"use strict"; return (${source});`)() as unknown;
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`Uncomputable expression "${expression}".`);
  }
  return result as number;
}