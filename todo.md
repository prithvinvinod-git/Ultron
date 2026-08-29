1.setup the ai's response style and ux with this component:You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
ai-agent-response.tsx
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Search,
  Terminal,
  Check,
  Globe,
  ExternalLink,
  Brain,
  FileCode2,
  FileText,
  Command,
  Database,
  AlertCircle,
  Cpu,
  Code2,
  Copy,
  CheckCheck,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────
 * SAFE DYNAMIC ICON RENDERER
 * ───────────────────────────────────────────────────────── */
function renderDynamicIcon(icon: any, className?: string): React.ReactNode {
  if (!icon) return null;
  if (React.isValidElement(icon)) return icon;
  if (typeof icon === "function" || typeof icon === "object") {
    return React.createElement(icon, {
      className: cn("size-3.5 shrink-0", className),
      "aria-hidden": "true",
    });
  }
  return null;
}

/* ─────────────────────────────────────────────────────────
 * COMPACT 3x3 PIXEL DOT GRID LOADER
 * ───────────────────────────────────────────────────────── */
const CHEVRON_DELAYS = Array.from({ length: 9 }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return (c + Math.abs(r - 1)) * 90;
});

export function PixelDotsLoader({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 grid-cols-[repeat(3,3px)] gap-[1.5px] items-center",
        className
      )}
    >
      {CHEVRON_DELAYS.map((delay, index) => (
        <span
          key={index}
          className="size-[3px] rounded-full bg-foreground/80 transition-opacity motion-reduce:animate-none"
          style={{
            opacity: 0.2,
            animation: `agent-pixel-on 650ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms infinite`,
          }}
        />
      ))}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
 * TERMINAL & BASH COMMAND EXECUTION VIEWER
 * ───────────────────────────────────────────────────────── */
export interface TerminalCommandProps {
  command: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  isRunning?: boolean;
  className?: string;
}

export function TerminalCommand({
  command,
  output,
  exitCode = 0,
  durationMs,
  isRunning = false,
  className,
}: TerminalCommandProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    const fullText = output ? `$ ${command}

${output}` : `$ ${command}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-card font-mono text-[11.5px] shadow-xs select-text",
        className
      )}
    >
      {/* Terminal Command Header */}
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Terminal className="size-3.5 text-violet-500 shrink-0" aria-hidden="true" />
          <span className="text-muted-foreground/60 select-none font-bold">$</span>
          <span className="truncate font-semibold text-foreground tracking-tight">{command}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {durationMs !== undefined && (
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {durationMs}ms
            </span>
          )}

          {isRunning ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10.5px] font-medium text-violet-600 dark:text-violet-400">
              <span className="size-1.5 rounded-full bg-violet-500 animate-pulse" />
              running
            </span>
          ) : exitCode === 0 ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
              exit 0
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-rose-600 dark:text-rose-400 tabular-nums">
              exit {exitCode}
            </span>
          )}

          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied command and output" : "Copy command"}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-1 py-0.5 active:scale-[0.96]"
          >
            {copied ? (
              <CheckCheck className="size-3 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="size-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Stdout Output Area */}
      {output && (
        <div className="relative p-2.5 overflow-x-auto bg-muted/20 text-[11px] leading-relaxed text-muted-foreground">
          <pre className="whitespace-pre font-mono">
            {output.split("
").map((line, idx) => {
              const isPass = line.includes("✓") || line.includes("PASS") || line.includes("passed");
              const isFail = line.includes("FAIL") || line.includes("Error") || line.includes("failed");
              const isWarn = line.includes("WARN") || line.includes("warning");

              return (
                <div
                  key={idx}
                  className={cn(
                    "flex items-start gap-1",
                    isPass && "text-emerald-600 dark:text-emerald-400 font-medium",
                    isFail && "text-rose-600 dark:text-rose-400 font-medium",
                    isWarn && "text-amber-600 dark:text-amber-400",
                    !isPass && !isFail && !isWarn && "text-muted-foreground"
                  )}
                >
                  <span>{line}</span>
                </div>
              );
            })}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * REAL FILE DIFF VIEWER
 * ───────────────────────────────────────────────────────── */
export type DiffRow = {
  old?: number | null;
  cur?: number | null;
  type: "add" | "del" | "ctx";
  text: string;
};

export interface FileDiffProps {
  file: string;
  rows: DiffRow[];
  className?: string;
}

export function FileDiff({ file, rows = [], className }: FileDiffProps) {
  const [copied, setCopied] = React.useState(false);
  const added = rows.filter((r) => r.type === "add").length;
  const removed = rows.filter((r) => r.type === "del").length;

  const handleCopy = () => {
    const textContent = rows
      .map((r) => `${r.type === "add" ? "+" : r.type === "del" ? "-" : " "} ${r.text}`)
      .join("
");
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div
      className={cn(
        "flex w-full flex-col overflow-hidden rounded-lg border border-border/80 bg-card font-mono text-[11.5px] shadow-xs select-text",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="truncate font-medium text-foreground tracking-tight">{file}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <div className="flex items-center gap-1.5 tabular-nums text-[11px] font-semibold">
            {added > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>}
            {removed > 0 && <span className="text-rose-600 dark:text-rose-400">−{removed}</span>}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copied diff" : "Copy diff to clipboard"}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm px-1 py-0.5 active:scale-[0.96]"
          >
            {copied ? (
              <CheckCheck className="size-3 text-emerald-500" aria-hidden="true" />
            ) : (
              <Copy className="size-3" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Code Gutter & Lines */}
      <div className="relative flex flex-col py-1.5 overflow-x-auto leading-[21px]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-[70px] top-0 w-[1px] bg-border/60 z-1"
        />

        {rows.map((r, i) => (
          <div
            key={i}
            className={cn(
              "group relative grid grid-cols-[34px_34px_20px_1fr] items-stretch transition-colors duration-100",
              r.type === "add" && "bg-emerald-500/10 dark:bg-emerald-500/15 text-emerald-950 dark:text-emerald-100",
              r.type === "del" && "bg-rose-500/10 dark:bg-rose-500/15 text-rose-950 dark:text-rose-100",
              r.type === "ctx" && "text-muted-foreground"
            )}
          >
            {r.type === "add" && (
              <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-500" aria-hidden="true" />
            )}
            {r.type === "del" && (
              <span
                className="absolute left-0 top-0 bottom-0 w-[3px]"
                aria-hidden="true"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, #ef4444 0, #ef4444 1.5px, transparent 1.5px, transparent 3px)",
                }}
              />
            )}

            <span className={cn("select-none text-right pr-2 text-[10.5px] tabular-nums", r.type === "del" ? "text-rose-600 dark:text-rose-400 font-semibold" : "text-muted-foreground/60")}>
              {r.old ?? ""}
            </span>
            <span className={cn("select-none text-right pr-2 text-[10.5px] tabular-nums", r.type === "add" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground/60")}>
              {r.cur ?? ""}
            </span>

            <span className={cn("select-none text-center text-[11px] font-bold", r.type === "add" && "text-emerald-600 dark:text-emerald-400", r.type === "del" && "text-rose-600 dark:text-rose-400")}>
              {r.type === "add" ? "+" : r.type === "del" ? "−" : ""}
            </span>

            <code className={cn("whitespace-pre pl-1 pr-3 text-[11.5px] font-mono", r.type === "add" ? "text-foreground font-medium" : r.type === "del" ? "text-foreground line-through opacity-80" : "text-muted-foreground")}>
              {r.text}
            </code>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * TYPE DEFINITIONS & SCHEMAS
 * ───────────────────────────────────────────────────────── */
export type TraceNodeType =
  | "reasoning"
  | "step"
  | "search"
  | "tool"
  | "terminal"
  | "diffs"
  | (string & {});

export type DetailLine = {
  text: string;
  tone?: "add" | "del" | "ctx" | "muted" | "error";
};

export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  label?: string | ((args: TArgs) => string);
  icon?: any;
  iconClassName?: string;
  formatChip?: (args: TArgs, result?: TResult) => string;
  monoChip?: boolean;
  renderCustomContent?: (props: {
    args?: TArgs;
    result?: TResult;
    node: TraceNode<TArgs, TResult>;
  }) => React.ReactNode;
}

export type TraceNode<TArgs = any, TResult = any> = {
  id?: string;
  type: TraceNodeType;
  toolName?: string;
  sentences?: string[];
  durationSeconds?: number;
  primary?: string;
  secondary?: string;
  mono?: boolean;
  icon?: any;
  iconClassName?: string;
  status?: "pending" | "running" | "completed" | "failed";
  args?: TArgs;
  result?: TResult;
  command?: string;
  output?: string;
  exitCode?: number;
  durationMs?: number;
  add?: number;
  del?: number;
  diffRows?: DiffRow[];
  diffFile?: string;
  codeSnippet?: string;
  details?: DetailLine[];
  sources?: { name: string; url?: string }[];
  renderContent?: () => React.ReactNode;
};

export type AgentPhase = {
  trace: TraceNode[];
  message?: string;
};

const SENT_H = 46;
const GAP = 8;
const MAX_H = 184;
const FADE = 18;

/* ─────────────────────────────────────────────────────────
 * DEFAULT TOOL REGISTRY
 * ───────────────────────────────────────────────────────── */
export const DEFAULT_TOOL_REGISTRY: Record<string, ToolDefinition> = {
  read_file: {
    name: "read_file",
    label: "Read",
    icon: FileText,
    iconClassName: "text-muted-foreground/80",
    monoChip: true,
  },
  edit_file: {
    name: "edit_file",
    label: "Edit",
    icon: FileCode2,
    iconClassName: "text-amber-500",
    monoChip: true,
  },
  execute_command: {
    name: "execute_command",
    label: "Run",
    icon: Terminal,
    iconClassName: "text-violet-500",
    monoChip: true,
  },
  search_web: {
    name: "search_web",
    label: "Search",
    icon: Search,
    iconClassName: "text-blue-500",
  },
  query_database: {
    name: "query_database",
    label: "SQL Query",
    icon: Database,
    iconClassName: "text-emerald-500",
    monoChip: true,
  },
};

/* ─────────────────────────────────────────────────────────
 * STREAMING TEXT
 * ───────────────────────────────────────────────────────── */
export interface StreamingTextProps extends React.HTMLAttributes<HTMLDivElement> {
  text: string;
  speed?: number;
  chunkSize?: number;
  onComplete?: () => void;
}

export function StreamingText({
  text,
  speed = 18,
  chunkSize = 2,
  className,
  onComplete,
  ...props
}: StreamingTextProps) {
  const [shown, setShown] = React.useState("");
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  React.useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i += chunkSize;
      const nextText = text.slice(0, i);
      setShown(nextText);
      if (i >= text.length) {
        clearInterval(id);
        onCompleteRef.current?.();
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed, chunkSize]);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "font-sans text-[14.5px] leading-relaxed text-foreground/90 select-text whitespace-pre-line text-pretty",
        className
      )}
      {...props}
    >
      {shown}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * NESTED REASONING BLOCK
 * ───────────────────────────────────────────────────────── */
interface NestedReasoningBlockProps {
  sentences: string[];
  delays?: number[];
  isActive: boolean;
  isFinished: boolean;
  durationSeconds?: number;
  onFinished?: () => void;
}

export function NestedReasoningBlock({
  sentences,
  delays,
  isActive,
  isFinished,
  durationSeconds = 4.2,
  onFinished,
}: NestedReasoningBlockProps) {
  const [revealedCount, setRevealedCount] = React.useState(isFinished ? sentences.length : 0);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [fade, setFade] = React.useState({ top: false, bottom: true });
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const onFinishedRef = React.useRef(onFinished);
  onFinishedRef.current = onFinished;

  React.useEffect(() => {
    if (!isActive || isFinished) return;

    const cadence = delays || sentences.map(() => 1800 + Math.floor(Math.random() * 400));
    const totalMs = cadence.reduce((a, b) => a + b, 0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cumulative = 0;

    cadence.forEach((delay, idx) => {
      cumulative += delay;
      timers.push(
        setTimeout(() => {
          setRevealedCount(idx + 1);
        }, cumulative)
      );
    });

    timers.push(
      setTimeout(() => {
        onFinishedRef.current?.();
      }, totalMs + 600)
    );

    return () => timers.forEach(clearTimeout);
  }, [isActive, isFinished, delays, sentences]);

  const expanded = isFinished ? manualOpen : isActive;
  const count = isFinished ? sentences.length : revealedCount;
  const contentH = count > 0 ? count * SENT_H + (count - 1) * GAP : 0;
  const capped = contentH > MAX_H;
  const viewH = capped ? MAX_H : contentH;
  const scrollable = isFinished && manualOpen;
  const translate = scrollable ? 0 : capped ? MAX_H - FADE - contentH : 0;

  const showTop = scrollable ? fade.top : capped;
  const showBottom = scrollable ? fade.bottom : capped;

  const mask = capped
    ? `linear-gradient(to bottom, transparent 0, #000 ${
        showTop ? FADE : 0
      }px, #000 calc(100% - ${showBottom ? FADE : 0}px), transparent 100%)`
    : "none";

  const onScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    setFade({
      top: el.scrollTop > 1,
      bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 1,
    });
  };

  return (
    <div className="flex w-full flex-col my-0.5" style={{ animation: "agent-fade 280ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <button
        type="button"
        disabled={!isFinished}
        aria-expanded={expanded}
        onClick={() => isFinished && setManualOpen((v) => !v)}
        className={cn(
          "group/row relative flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-[12px] transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          isFinished ? "hover:bg-muted/60 cursor-pointer active:scale-[0.98]" : "cursor-default"
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <Brain
            aria-hidden="true"
            className={cn(
              "size-3.5 opacity-75 transition-opacity duration-150",
              isFinished && "group-hover/row:opacity-0",
              manualOpen && "opacity-0"
            )}
          />
          {isFinished && (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "absolute size-3.5 transition-transform duration-200 opacity-0",
                "group-hover/row:opacity-100",
                manualOpen ? "opacity-100 rotate-0" : "-rotate-90"
              )}
            />
          )}
        </span>

        <span className="text-[12px] font-medium transition-colors">
          {isFinished ? (
            <span className="text-foreground">
              Thought for <span className="tabular-nums font-mono text-[11.5px]">{durationSeconds}s</span>
            </span>
          ) : (
            <span
              className="bg-clip-text text-transparent font-medium"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, var(--color-muted-foreground, oklch(0.55 0 0)) 35%, var(--color-foreground, oklch(0.95 0 0)) 50%, var(--color-muted-foreground, oklch(0.55 0 0)) 65%)",
                backgroundSize: "200% 100%",
                animation: "agent-shimmer 1.8s linear infinite",
              }}
            >
              Thinking…
            </span>
          )}
        </span>
      </button>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-1 mb-1.5 ml-2.5 border-l border-border/70 py-0.5 pl-2.5">
            <div
              ref={viewportRef}
              className={cn(
                "overflow-hidden transition-[height] duration-300 ease-out pr-1",
                scrollable && "overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              )}
              style={{
                height: `${viewH}px`,
                WebkitMaskImage: mask,
                maskImage: mask,
              }}
              onScroll={scrollable ? onScroll : undefined}
            >
              <div
                className="flex flex-col gap-2 transition-transform duration-400 ease-out will-change-transform"
                style={{ transform: `translateY(${translate}px)` }}
              >
                {sentences.slice(0, count).map((line, i) => (
                  <p
                    key={i}
                    className="m-0 h-[46px] text-[13px] font-[425] leading-[23px] tracking-tight text-muted-foreground line-clamp-2 overflow-hidden text-pretty"
                    style={{ animation: "agent-fade 250ms cubic-bezier(0.23,1,0.32,1) both" }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * UNIVERSAL EXTENSIBLE PILL ROW ITEM
 * ───────────────────────────────────────────────────────── */
interface TracePillRowProps {
  node: TraceNode;
  isActive: boolean;
  isFinished: boolean;
  toolRegistry?: Record<string, ToolDefinition>;
}

function TracePillRow({
  node,
  isActive,
  isFinished,
  toolRegistry = DEFAULT_TOOL_REGISTRY,
}: TracePillRowProps) {
  const [open, setOpen] = React.useState(false);

  const toolDef = node.toolName ? toolRegistry[node.toolName] : undefined;

  const isCommandNode = Boolean(
    node.command || node.type === "terminal" || node.type === "command"
  );

  const hasDetails = Boolean(
    isCommandNode ||
      node.renderContent ||
      toolDef?.renderCustomContent ||
      node.diffRows ||
      node.codeSnippet ||
      (node.details && node.details.length > 0) ||
      (node.sources && node.sources.length > 0) ||
      node.args ||
      node.result
  );

  const primaryText =
    node.primary ||
    (isCommandNode ? "Run" : undefined) ||
    (typeof toolDef?.label === "function" ? toolDef.label(node.args) : toolDef?.label) ||
    toolDef?.name ||
    node.type;

  const secondaryText =
    node.secondary ||
    node.command ||
    (toolDef?.formatChip ? toolDef.formatChip(node.args, node.result) : undefined) ||
    (typeof node.args === "string" ? node.args : undefined);

  const isMono = node.mono ?? (isCommandNode || Boolean(toolDef?.monoChip));

  const renderIcon = () => {
    if (isActive) {
      return (
        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-foreground"
        />
      );
    }
    if (node.status === "failed" || (node.exitCode !== undefined && node.exitCode > 0)) {
      return <AlertCircle className="size-3.5 text-rose-500 shrink-0" aria-hidden="true" />;
    }

    if (node.icon) return renderDynamicIcon(node.icon, node.iconClassName);
    if (toolDef?.icon) return renderDynamicIcon(toolDef.icon, toolDef.iconClassName);

    const semanticKey = `${node.primary || ""} ${node.toolName || ""} ${node.type || ""} ${node.command || ""}`.toLowerCase();

    if (semanticKey.includes("read") || semanticKey.includes("inspect") || semanticKey.includes("parse")) {
      return <FileText className="size-3.5 text-muted-foreground/80 shrink-0" aria-hidden="true" />;
    }
    if (
      semanticKey.includes("edit") ||
      semanticKey.includes("write") ||
      semanticKey.includes("patch") ||
      semanticKey.includes("create")
    ) {
      return <FileCode2 className="size-3.5 text-amber-500 shrink-0" aria-hidden="true" />;
    }
    if (
      isCommandNode ||
      semanticKey.includes("run") ||
      semanticKey.includes("test") ||
      semanticKey.includes("compile") ||
      semanticKey.includes("tsc") ||
      semanticKey.includes("exec")
    ) {
      return <Terminal className="size-3.5 text-violet-500 shrink-0" aria-hidden="true" />;
    }
    if (semanticKey.includes("search") || semanticKey.includes("query") || semanticKey.includes("lookup")) {
      return <Search className="size-3.5 text-blue-500 shrink-0" aria-hidden="true" />;
    }
    if (semanticKey.includes("db") || semanticKey.includes("database") || semanticKey.includes("sql") || semanticKey.includes("redis")) {
      return <Database className="size-3.5 text-emerald-500 shrink-0" aria-hidden="true" />;
    }
    if (semanticKey.includes("deploy") || semanticKey.includes("canary") || semanticKey.includes("cluster")) {
      return <Cpu className="size-3.5 text-sky-500 shrink-0" aria-hidden="true" />;
    }
    if (node.type === "step") {
      return <Check className="size-3.5 text-emerald-500 shrink-0" aria-hidden="true" />;
    }

    return <Command className="size-3.5 text-muted-foreground/80 shrink-0" aria-hidden="true" />;
  };

  return (
    <div className="flex flex-col my-0.5" style={{ animation: "agent-fade 280ms cubic-bezier(0.23,1,0.32,1) both" }}>
      <button
        type="button"
        disabled={!hasDetails}
        aria-expanded={open}
        onClick={() => hasDetails && setOpen((v) => !v)}
        className={cn(
          "group/row relative flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-left text-[12px] transition-colors duration-150",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          hasDetails ? "hover:bg-muted/60 cursor-pointer active:scale-[0.98]" : "cursor-default"
        )}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          <span
            className={cn(
              "transition-opacity duration-150 flex items-center justify-center",
              hasDetails && "group-hover/row:opacity-0",
              open && "opacity-0"
            )}
          >
            {renderIcon()}
          </span>
          {hasDetails && (
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "absolute size-3.5 transition-transform duration-200 opacity-0",
                "group-hover/row:opacity-100",
                open ? "opacity-100 rotate-0" : "-rotate-90"
              )}
            />
          )}
        </span>

        <span className="shrink-0 text-[12px] font-medium text-foreground tracking-tight">
          {primaryText}
        </span>

        {secondaryText && (
          <span
            className={cn(
              "inline-flex h-5 min-w-0 max-w-[65%] items-center truncate rounded-md bg-muted/80 px-1.5 text-[11px] text-muted-foreground border border-border/40 transition-colors group-hover/row:border-border/80 group-hover/row:text-foreground",
              isMono ? "font-mono" : "font-sans"
            )}
          >
            <span className="truncate">{secondaryText}</span>
          </span>
        )}

        {(node.add !== undefined || node.del !== undefined) && (
          <span className="ml-auto flex items-center gap-1 font-mono text-[11px] tabular-nums shrink-0">
            {node.add !== undefined && node.add > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">+{node.add}</span>
            )}
            {node.del !== undefined && node.del > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium">−{node.del}</span>
            )}
          </span>
        )}
      </button>

      {hasDetails && (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1 mb-1.5 ml-2.5 flex flex-col gap-1.5 border-l border-border/70 py-0.5 pl-2.5">
              {/* Custom Viewport Renderers */}
              {node.renderContent ? (
                node.renderContent()
              ) : toolDef?.renderCustomContent ? (
                toolDef.renderCustomContent({
                  args: node.args,
                  result: node.result,
                  node,
                })
              ) : null}

              {/* Dedicated Terminal Execution Format */}
              {isCommandNode && node.command && (
                <TerminalCommand
                  command={node.command}
                  output={node.output}
                  exitCode={node.exitCode ?? 0}
                  durationMs={node.durationMs}
                  isRunning={isActive}
                />
              )}

              {/* Real Embedded FileDiff Component */}
              {node.diffRows && (
                <FileDiff
                  file={node.diffFile || (typeof node.secondary === "string" ? node.secondary : "patch.ts")}
                  rows={node.diffRows}
                />
              )}

              {/* Structured Line Details */}
              {!isCommandNode && node.details && node.details.length > 0 && (
                <div className="flex flex-col gap-1">
                  {node.details.map((line, lIdx) => (
                    <span
                      key={lIdx}
                      className={cn(
                        "text-[11.5px] leading-relaxed",
                        line.tone === "add" && "text-emerald-600 dark:text-emerald-400 font-mono",
                        line.tone === "del" && "text-rose-600 dark:text-rose-400 font-mono",
                        line.tone === "ctx" && "text-muted-foreground font-mono",
                        line.tone === "error" && "text-rose-600 dark:text-rose-400 font-medium",
                        (!line.tone || line.tone === "muted") && "text-muted-foreground"
                      )}
                    >
                      {line.text}
                    </span>
                  ))}
                </div>
              )}

              {/* Code Snippet Fallback */}
              {!isCommandNode && !node.diffRows && node.codeSnippet && (
                <div className="rounded-lg border border-border/70 bg-muted/40 p-2.5 font-mono text-[11px] leading-relaxed text-foreground overflow-x-auto">
                  <pre className="whitespace-pre">{node.codeSnippet}</pre>
                </div>
              )}

              {/* Sources */}
              {node.sources && node.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {node.sources.map((src, sIdx) => (
                    <a
                      key={sIdx}
                      href={src.url || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-border hover:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Globe className="size-2.5 opacity-70" aria-hidden="true" />
                      <span>{src.name}</span>
                      <ExternalLink className="size-2.5 opacity-50" aria-hidden="true" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
 * THINKING STATE (Unboxed Seamless Trigger)
 * ───────────────────────────────────────────────────────── */
export interface ThinkingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  nodes?: TraceNode[];
  tools?: Record<string, ToolDefinition>;
  autoPlay?: boolean;
  defaultExpanded?: boolean;
  workingLabel?: string;
  onSettled?: () => void;
}

export const ThinkingState = React.forwardRef<HTMLDivElement, ThinkingStateProps>(
  (
    {
      nodes = [],
      tools = DEFAULT_TOOL_REGISTRY,
      autoPlay = true,
      defaultExpanded,
      workingLabel = "Working...",
      onSettled,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const totalNodes = nodes.length;
    const [activeIndex, setActiveIndex] = React.useState(autoPlay ? 0 : totalNodes);
    const [isWorking, setIsWorking] = React.useState(autoPlay);
    const [manualExpanded, setManualExpanded] = React.useState<boolean | null>(
      defaultExpanded !== undefined ? defaultExpanded : null
    );

    const startTimeRef = React.useRef<number>(Date.now());
    const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0);
    const isWorkingRef = React.useRef(isWorking);
    isWorkingRef.current = isWorking;

    const onSettledRef = React.useRef(onSettled);
    onSettledRef.current = onSettled;

    React.useEffect(() => {
      if (!autoPlay) return;
      startTimeRef.current = Date.now();

      const timer = setInterval(() => {
        if (!isWorkingRef.current) {
          clearInterval(timer);
          return;
        }
        const diff = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
        setElapsedSeconds(diff);
      }, 250);

      return () => clearInterval(timer);
    }, [autoPlay]);

    const advanceStep = React.useCallback(() => {
      setActiveIndex((prev) => {
        const next = prev + 1;
        if (next >= totalNodes) {
          setIsWorking(false);
          const finalDuration = Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000));
          setElapsedSeconds(finalDuration);
        }
        return next;
      });
    }, [totalNodes]);

    React.useEffect(() => {
      if (!autoPlay || !isWorking || activeIndex >= totalNodes) return;

      const currentNode = nodes[activeIndex];
      if (currentNode?.type === "reasoning") return;

      const delay =
        currentNode?.type === "tool" || currentNode?.type === "terminal"
          ? 2200
          : currentNode?.type === "search"
          ? 2400
          : 1700;

      const timer = setTimeout(() => {
        advanceStep();
      }, delay);

      return () => clearTimeout(timer);
    }, [activeIndex, autoPlay, isWorking, totalNodes, nodes, advanceStep]);

    React.useEffect(() => {
      if (!isWorking && autoPlay) {
        onSettledRef.current?.();
      }
    }, [isWorking, autoPlay]);

    const isGlobalExpanded = manualExpanded !== null ? manualExpanded : isWorking;

    return (
      <div
        ref={ref}
        className={cn("flex w-full flex-col font-sans select-none text-foreground", className)}
        style={style}
        {...props}
      >
        <style>{`
          @keyframes agent-pixel-on {
            0%, 100% { opacity: 0.15; transform: scale(0.9); }
            50% { opacity: 0.95; transform: scale(1.1); }
          }
          @keyframes agent-shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes agent-fade {
            from { opacity: 0; transform: translateY(2px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        {/* Master Header Trigger (Seamless unboxed prose integration) */}
        <button
          type="button"
          aria-expanded={isGlobalExpanded}
          onClick={() => setManualExpanded((prev) => !(prev !== null ? prev : isWorking))}
          className={cn(
            "group flex w-fit items-center gap-1.5 p-0 bg-transparent text-left transition-colors duration-150 cursor-pointer",
            "text-muted-foreground/75 hover:text-foreground font-normal text-[13.5px] leading-relaxed",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-xs"
          )}
        >
          {isWorking && <PixelDotsLoader />}

          <span className="text-[13.5px] font-normal transition-colors">
            {isWorking ? (
              <span
                className="bg-clip-text text-transparent font-medium"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, var(--color-muted-foreground, oklch(0.55 0 0)) 35%, var(--color-foreground, oklch(0.95 0 0)) 50%, var(--color-muted-foreground, oklch(0.55 0 0)) 65%)",
                  backgroundSize: "200% 100%",
                  animation: "agent-shimmer 1.5s linear infinite",
                }}
              >
                {workingLabel}
              </span>
            ) : (
              <span>
                Worked for <span className="tabular-nums font-mono text-[12px]">{elapsedSeconds}</span> {elapsedSeconds === 1 ? "second" : "seconds"}
              </span>
            )}
          </span>

          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3 opacity-30 transition-transform duration-300 group-hover:opacity-80",
              isGlobalExpanded ? "rotate-180" : "rotate-0"
            )}
          />
        </button>

        {/* Master Collapsible Timeline Channel */}
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
            isGlobalExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "grid-rows-[0fr] opacity-0 pointer-events-none"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-1 ml-2 border-l border-border/60 py-0.5 pl-2 flex flex-col gap-0.5">
              {nodes.slice(0, activeIndex + 1).map((node, idx) => {
                const isNodeActive = idx === activeIndex && isWorking;
                const isNodeFinished = idx < activeIndex || !isWorking;

                if (node.type === "reasoning" && node.sentences) {
                  return (
                    <NestedReasoningBlock
                      key={idx}
                      sentences={node.sentences}
                      durationSeconds={node.durationSeconds}
                      isActive={isNodeActive}
                      isFinished={isNodeFinished}
                      onFinished={advanceStep}
                    />
                  );
                }

                return (
                  <TracePillRow
                    key={idx}
                    node={node}
                    isActive={isNodeActive}
                    isFinished={isNodeFinished}
                    toolRegistry={tools}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }
);
ThinkingState.displayName = "ThinkingState";

/* ─────────────────────────────────────────────────────────
 * MULTI-PHASE AGENT WORKFLOW ORCHESTRATOR
 * ───────────────────────────────────────────────────────── */
export interface AgentWorkflowProps extends React.HTMLAttributes<HTMLDivElement> {
  phases: AgentPhase[];
  tools?: Record<string, ToolDefinition>;
  workingLabel?: string;
  onComplete?: () => void;
}

export function AgentWorkflow({
  phases = [],
  tools,
  workingLabel = "Working...",
  onComplete,
  className,
  ...props
}: AgentWorkflowProps) {
  const [currentPhaseIdx, setCurrentPhaseIdx] = React.useState(0);
  const [phaseStatus, setPhaseStatus] = React.useState<"trace" | "message">("trace");
  const onCompleteRef = React.useRef(onComplete);
  onCompleteRef.current = onComplete;

  const handleTraceSettled = React.useCallback((idx: number) => {
    if (idx === currentPhaseIdx) {
      if (phases[idx]?.message) {
        setPhaseStatus("message");
      } else if (idx < phases.length - 1) {
        setCurrentPhaseIdx((prev) => prev + 1);
        setPhaseStatus("trace");
      } else {
        onCompleteRef.current?.();
      }
    }
  }, [currentPhaseIdx, phases]);

  const handleMessageCompleted = React.useCallback((idx: number) => {
    if (idx === currentPhaseIdx) {
      if (idx < phases.length - 1) {
        setCurrentPhaseIdx((prev) => prev + 1);
        setPhaseStatus("trace");
      } else {
        onCompleteRef.current?.();
      }
    }
  }, [currentPhaseIdx, phases]);

  return (
    <div className={cn("flex flex-col gap-4 w-full", className)} {...props}>
      {phases.map((phase, idx) => {
        if (idx > currentPhaseIdx) return null;

        const isCurrentPhase = idx === currentPhaseIdx;
        const shouldShowTrace = true;
        const shouldPlayTrace = isCurrentPhase && phaseStatus === "trace";
        const isTraceFinished = !isCurrentPhase || phaseStatus === "message";

        const shouldShowMessage = isTraceFinished && !!phase.message;
        const shouldStreamMessage = isCurrentPhase && phaseStatus === "message";

        return (
          <div key={idx} className="flex flex-col gap-1">
            {shouldShowTrace && (
              <ThinkingState
                nodes={phase.trace}
                tools={tools}
                autoPlay={shouldPlayTrace}
                workingLabel={workingLabel}
                onSettled={() => handleTraceSettled(idx)}
              />
            )}

            {shouldShowMessage && phase.message && (
              <div className="pt-0 animate-[agent-fade_300ms_ease-out_both]">
                {shouldStreamMessage ? (
                  <StreamingText
                    text={phase.message}
                    speed={18}
                    chunkSize={2}
                    onComplete={() => handleMessageCompleted(idx)}
                  />
                ) : (
                  <div className="font-sans text-[14.5px] leading-relaxed text-foreground/90 select-text whitespace-pre-line text-pretty">
                    {phase.message}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

demo.tsx
"use client";

import * as React from "react";
import {
  AgentWorkflow,
  type AgentPhase,
  type ToolDefinition,
} from "@/components/ui/ai-agent-response";
import { RotateCcw, Database, ShieldCheck, Cpu } from "lucide-react";

const CUSTOM_TOOLS: Record<string, ToolDefinition> = {
  db_inspect: {
    name: "db_inspect",
    label: "Inspect Schema",
    icon: Database,
    iconClassName: "text-emerald-500",
    monoChip: true,
  },
  vuln_scan: {
    name: "vuln_scan",
    label: "Security Audit",
    icon: ShieldCheck,
    iconClassName: "text-rose-500",
  },
  cluster_exec: {
    name: "cluster_exec",
    label: "Deploy Canary",
    icon: Cpu,
    iconClassName: "text-sky-500",
    monoChip: true,
  },
};

export const MULTI_ROUND_AGENT_WORKFLOW: AgentPhase[] = [
  // ── PHASE 1: Audit & Discovery ──
  {
    trace: [
      {
        type: "reasoning",
        sentences: [
          "Auditing authentication middleware AST for algorithm injection vulnerabilities and permissive defaults.",
          "Inspecting the global Express auth middleware call tree to locate the jwt.verify invocation.",
          "The current verify implementation accepts undefined algorithms, exposing an algorithm confusion vulnerability ('none' cipher exploit).",
          "Tracing where process.env.JWT_SECRET is sourced to guarantee the cryptographic key is never exposed via response headers.",
          "Analyzing the token expiration timestamp format to prevent UNIX 2038 integer wrap-around errors.",
          "Formulating a strict allowlist schema requiring HS256 algorithm pinning across all protected API routes.",
        ],
        durationSeconds: 9.8,
      },
      {
        type: "tool",
        toolName: "vuln_scan",
        secondary: "AST Check (3 files)",
        details: [
          { text: "✓ Found jwt.verify call at line 42 with missing algorithm constraint" },
          { text: "✓ Verified process.env.JWT_SECRET is isolated from debug log streams" },
        ],
      },
      {
        type: "tool",
        primary: "Read AST tree",
        secondary: "src/types/auth.d.ts",
        mono: true,
        details: [
          { text: "export interface AuthSession { sub: string; role: Role; exp: number }" },
          { text: "3 imported downstream route handlers depend on this contract" },
        ],
      },
      {
        type: "search",
        primary: "Search mitigation specs",
        secondary: "RFC 7519 algorithm confusion",
        sources: [
          { name: "Auth0 Security Advisory", url: "https://auth0.com" },
          { name: "Node JOSE Standards", url: "https://github.com" },
          { name: "OWASP JWT Cheat Sheet", url: "https://owasp.org" },
        ],
      },
    ],
    message: "I completed the security audit. Found an unpinned algorithm vulnerability in `src/middleware/auth.ts` that could allow unsigned tokens. Beginning the patch and LRU revocation cache implementation now.",
  },

  // ── PHASE 2: Code Patching, In-Memory Cache & Terminal Test Run ──
  {
    trace: [
      {
        type: "reasoning",
        sentences: [
          "Designing an in-memory sliding LRU cache with an automatic 15-minute TTL to track revoked token fingerprints.",
          "Ensuring thread safety and race-condition immunity during concurrent cache writes during cluster renewal handshakes.",
          "Adding a 10-second clock tolerance window (clockTolerance: 10) to guard against minor NTP drift between edge regions.",
          "Refactoring the jwt.verify wrapper to reject any payload lacking valid issuer and audience claim signatures.",
          "Injecting comprehensive TypeScript assertions to validate the patched session envelope.",
        ],
        durationSeconds: 10.4,
      },
      {
        type: "tool",
        primary: "Patch file",
        secondary: "src/auth/jwt-verifier.ts",
        mono: true,
        add: 3,
        del: 1,
        diffFile: "src/auth/jwt-verifier.ts",
        diffRows: [
          { old: 12, cur: 12, type: "ctx", text: "export const verifyOptions: jwt.VerifyOptions = {" },
          { old: 13, cur: null, type: "del", text: "  algorithms: undefined," },
          { old: null, cur: 13, type: "add", text: "  algorithms: ['HS256'], // pinned against cipher downgrade" },
          { old: null, cur: 14, type: "add", text: "  issuer: 'api.enterprise.internal'," },
          { old: null, cur: 15, type: "add", text: "  clockTolerance: 10," },
          { old: 14, cur: 16, type: "ctx", text: "};" },
        ],
      },
      {
        type: "tool",
        toolName: "db_inspect",
        secondary: "sessions.revoked_tokens",
        details: [
          { text: "✓ LRU TTL indexed in Redis cluster" },
          { text: "✓ 0 slow query alerts on key expiration" },
        ],
      },
      {
        type: "terminal",
        primary: "Execute tests",
        secondary: "npm run test:auth -- --coverage",
        command: "npm run test:auth -- --coverage",
        exitCode: 0,
        durationMs: 412,
        output: "PASS tests/auth/jwt-verifier.test.ts
  ✓ should pin HS256 algorithm (18ms)
  ✓ should reject unsigned tokens with HTTP 401 (12ms)
  ✓ should validate issuer and audience claims (8ms)
  ✓ should enforce sliding 15-minute LRU eviction (24ms)

Test Suites: 1 passed, 1 total
Tests:       14 passed, 14 total
Coverage:    100% Statements, 100% Branches",
      },
    ],
    message: "Security patch applied and verified with clean TypeScript compilation and 100% test coverage. Moving to adversarial regression testing and cluster canary deployment.",
  },

  // ── PHASE 3: Adversarial Fuzzing, Regression Matrix & Canary ──
  {
    trace: [
      {
        type: "reasoning",
        sentences: [
          "Synthesizing adversarial signature matrix and staging canary environment.",
          "Generating forged JWTs signed with algorithm 'none', asymmetric RSA keys, and corrupted header signatures.",
          "Verifying that all malformed and expired tokens return an unambiguous HTTP 401 Unauthorized without stack traces.",
          "Benchmarking token verification latency under synthetic 5,000 req/s load to confirm p99 stays below 12ms.",
          "Running the canary health probe across staging-cluster-01 before promoting the configuration.",
        ],
        durationSeconds: 8.2,
      },
      {
        type: "tool",
        primary: "Add test matrix",
        secondary: "tests/auth/adversarial.test.ts",
        mono: true,
        add: 6,
        del: 1,
        diffFile: "tests/auth/adversarial.test.ts",
        diffRows: [
          { old: 41, cur: 41, type: "ctx", text: "describe('Adversarial Algorithm Invariant', () => {" },
          { old: 42, cur: null, type: "del", text: "  // TODO: verify algorithm none reject" },
          { old: null, cur: 42, type: "add", text: "  it('should reject algorithm none with HTTP 401', async () => {" },
          { old: null, cur: 43, type: "add", text: "    const forged = forgeUnsignedToken({ sub: 'admin' });" },
          { old: null, cur: 44, type: "add", text: "    await expect(verifySession(forged)).rejects.toThrow('invalid algorithm');" },
          { old: null, cur: 45, type: "add", text: "  });" },
          { old: 43, cur: 46, type: "ctx", text: "});" },
        ],
      },
      {
        type: "terminal",
        primary: "Run canary probe",
        secondary: "kubectl rollout status deployment/auth-service",
        command: "kubectl rollout status deployment/auth-service --namespace=staging",
        exitCode: 0,
        durationMs: 890,
        output: "Waiting for deployment \"auth-service\" rollout to finish: 1 of 3 updated replicas are available...
Waiting for deployment \"auth-service\" rollout to finish: 2 of 3 updated replicas are available...
✓ deployment \"auth-service\" successfully rolled out
✓ Canary probe healthy (p99 latency 9.4ms, 0 errors)",
      },
      {
        type: "tool",
        toolName: "cluster_exec",
        secondary: "staging-cluster-01",
        details: [
          { text: "Traffic shifted: 10% → 100%" },
          { text: "Cluster latency: p99 9.4ms (Healthy)" },
        ],
      },
    ],
    message: "All 28 regression tests passed with zero regressions. The JWT auth middleware now pins HS256, validates revocation via the LRU cache, and successfully passed canary verification.",
  },
];

export default function ThinkingStateDemo() {
  const [replayKey, setReplayKey] = React.useState(0);

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-start pt-14 pb-28 px-4 sm:px-6 selection:bg-primary/20 antialiased [font-synthesis:none]">
      {/* Floating Replay Action */}
      <div className="fixed top-6 left-6 z-20">
        <button
          type="button"
          onClick={() => setReplayKey((k) => k + 1)}
          className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm transition-all duration-150 hover:border-border hover:text-foreground active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none cursor-pointer shadow-xs"
        >
          <RotateCcw className="size-3" aria-hidden="true" />
          <span>Replay</span>
        </button>
      </div>

      {/* Main Chat Thread Container */}
      <div className="w-full max-w-2xl flex flex-col gap-6">
        {/* User Prompt Message */}
        <div className="flex justify-end">
          <div className="rounded-2xl bg-muted px-4 py-2.5 text-[14px] leading-relaxed text-foreground max-w-[88%] shadow-xs text-balance">
            Can you audit our auth middleware for security vulnerabilities, patch any algorithm bypasses, and add regression tests?
          </div>
        </div>

        {/* Multi-Round Agent Workflow */}
        <div className="flex flex-col">
          <AgentWorkflow
            key={replayKey}
            phases={MULTI_ROUND_AGENT_WORKFLOW}
            tools={CUSTOM_TOOLS}
            workingLabel="Working..."
          />
        </div>
      </div>
    </div>
  );
}
```

Install NPM dependencies:
```bash
lucide-react
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them ;



























 2.thinking animation of agent :You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
thinking-orbs.tsx
// Thinking Orbs — an animated thinking/agent orb.
//
// Six hand-tuned canvas animations, each a distinct state:
//   working · searching · solving · listening · composing · shaping
// Two tuned size presets ship: 64 (chat-avatar scale) and 20 (inline-text
// scale) — each carries its own dot count / dot size / speed tuning.
//
// Theme-aware: `theme="auto"` (default) resolves from a `data-theme` / `dark`
// class on any ancestor, else `prefers-color-scheme`, live-updating on change;
// `dark` / `light` pin the palette. SSR-safe — the canvas is client-only.
//
// Source & playground: https://orbs.jakubantalik.com
import { ThinkingOrb } from "thinking-orbs"

export { ThinkingOrb } from "thinking-orbs"
export type {
  ThinkingOrbProps,
  OrbState,
  OrbSize,
  OrbTheme,
} from "thinking-orbs"

export default ThinkingOrb


demo.tsx
import { ThinkingOrb } from "@/components/ui/thinking-orbs"

// Thinking (composing) — a single status pill, exactly as on the original site.
export default function ThinkingOrbThinkingDemo() {
  return (
    <div className="flex min-h-[360px] w-full items-center justify-center bg-[#070707] p-8">
      <div
        className="inline-flex h-[74px] items-center gap-3 rounded-full pl-[9px] pr-8"
        style={{
          background: "rgba(29,29,29,0.42)",
          boxShadow:
            "inset 0 0 0 1px rgba(44,47,54,0.31), inset 0 0 50px 0 rgba(255,255,255,0.012)",
        }}
      >
        <span className="[&_canvas]:!size-14">
          <ThinkingOrb state="composing" size={64} theme="dark" />
        </span>
        <span
          className="whitespace-nowrap text-lg leading-6"
          style={{ color: "rgba(251,251,251,0.5)" }}
        >
          Thinking….
        </span>
      </div>
    </div>
  )
}

```

Install NPM dependencies:
```bash
thinking-orbs
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them







































3. model switch component :You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:
```tsx
ai-model-select.tsx
"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, PencilIcon } from "lucide-react"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  type HTMLMotionProps,
} from "framer-motion"
import { createPortal } from "react-dom"
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* =============================================================================
 * ModelSelector — Motoko UI
 *
 * Cursor-style AI model picker: label + muted Effort/Fast/Thinking, hover Edit,
 * and a side panel for Effort / Context / Fast / Thinking.
 *
 *   <ModelSelector value={sel} onValueChange={setSel} models={models}>
 *     <ModelSelectorTrigger>
 *       <ModelSelectorValue />
 *     </ModelSelectorTrigger>
 *     <ModelSelectorContent />
 *   </ModelSelector>
 *
 *   <ModelSelectorKit value={sel} onValueChange={setSel} />
 * ============================================================================= */

// ---------------------------------------------------------------------------
// Motion tokens
// ---------------------------------------------------------------------------

const EASE = [0.2, 0, 0, 1] as const
const SPRING_SOFT = { type: "spring" as const, stiffness: 420, damping: 32 }
const SPRING_PRESS = { type: "spring" as const, stiffness: 500, damping: 28 }
const SPRING_ICON = { type: "spring" as const, duration: 0.3, bounce: 0 }

const MENU_PANEL_CLASS = cn(
  "bg-popover text-popover-foreground overflow-hidden rounded-2xl border-2 border-border p-1.5",
  "shadow-[0_8px_30px_-8px_rgba(8,8,8,0.18),0_2px_8px_-2px_rgba(8,8,8,0.08)]",
  "dark:shadow-[0_8px_30px_-8px_rgba(0,0,0,0.45),0_2px_8px_-2px_rgba(0,0,0,0.3)]"
)

type PresenceProps = Pick<
  HTMLMotionProps<"span">,
  "initial" | "animate" | "exit" | "transition"
>

const FADE_ONLY: PresenceProps = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const ICON_SWAP: PresenceProps = {
  initial: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  transition: SPRING_ICON,
}

function scaleBlurPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, scale: 0.9, filter: "blur(4px)" },
    transition: SPRING_ICON,
  }
}

function menuPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, y: 6, scale: 0.96, filter: "blur(4px)" },
    animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, y: 4, scale: 0.98, filter: "blur(2px)" },
    transition: { duration: 0.2, ease: EASE },
  }
}

function flyoutPresence(reduceMotion: boolean): PresenceProps {
  if (reduceMotion) return FADE_ONLY
  return {
    initial: { opacity: 0, x: -6, scale: 0.98, filter: "blur(4px)" },
    animate: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)" },
    exit: { opacity: 0, x: -4, scale: 0.98, filter: "blur(2px)" },
    transition: { duration: 0.18, ease: EASE },
  }
}

function valuePresence(reduceMotion: boolean): PresenceProps {
  return reduceMotion ? FADE_ONLY : ICON_SWAP
}

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 4 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE },
  },
}

const itemVariantsReduced = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.15 } },
}

// ---------------------------------------------------------------------------
// Public types & defaults
// ---------------------------------------------------------------------------

export type AiModelEffort = "high" | "medium" | "low"

export type AiModel = {
  id: string
  /** Display name, e.g. "Opus 4.5" or "Cursor Grok 4.5". */
  label: string
  description?: string
  efforts?: AiModelEffort[]
  contexts?: Array<string | number>
  supportsFast?: boolean
  supportsThinking?: boolean
  defaultEffort?: AiModelEffort
  defaultContext?: string | number
  defaultFast?: boolean
  defaultThinking?: boolean
  disabled?: boolean
}

/** Full selection: model id + per-model runtime options. */
export type AiModelSelection = {
  id: string
  effort?: AiModelEffort
  context?: string
  fast?: boolean
  thinking?: boolean
}

export const DEFAULT_AI_MODELS: AiModel[] = [
  {
    id: "opus-4.5",
    label: "Opus 4.5",
    description: "Powerful reasoning for complex coding and agentic tasks.",
    efforts: ["high", "medium", "low"],
    contexts: ["200K", "1M"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "high",
    defaultContext: "200K",
    defaultFast: true,
  },
  {
    id: "cursor-grok-4.5",
    label: "Cursor Grok 4.5",
    description: "Fast, capable model tuned for coding workflows.",
    efforts: ["high", "medium", "low"],
    contexts: ["128K", "256K"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "high",
    defaultContext: "128K",
    defaultFast: true,
  },
  {
    id: "gpt-5",
    label: "GPT-5",
    description: "General-purpose reasoning with strong code generation.",
    efforts: ["high", "medium", "low"],
    contexts: ["128K", "400K"],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: "medium",
    defaultContext: "128K",
  },
  {
    id: "gemini-2.5",
    label: "Gemini 2.5",
    description: "Long-context model for large files and repositories.",
    efforts: ["high", "medium", "low"],
    contexts: ["1M"],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: "low",
    defaultContext: "1M",
    defaultFast: true,
  },
]

const EFFORT_LABEL: Record<AiModelEffort, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
}

export interface ModelSelectorProps {
  children: React.ReactNode
  models?: AiModel[]
  value?: AiModelSelection
  defaultValue?: AiModelSelection
  onValueChange?: (value: AiModelSelection) => void
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

export interface ModelSelectorTriggerProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  children?: React.ReactNode
}

export type ModelSelectorValueProps = React.HTMLAttributes<HTMLSpanElement>

export interface ModelSelectorContentProps extends Omit<
  HTMLMotionProps<"div">,
  "children"
> {
  children?: React.ReactNode
  side?: "top" | "bottom"
}

export interface ModelSelectorKitProps {
  models?: AiModel[]
  value?: AiModelSelection
  defaultValue?: AiModelSelection
  onValueChange?: (value: AiModelSelection) => void
  disabled?: boolean
  className?: string
  "aria-label"?: string
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ModelSelectorContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  selection: AiModelSelection
  selectModel: (id: string) => void
  patchSelection: (patch: Partial<AiModelSelection>) => void
  models: AiModel[]
  selectedModel: AiModel | undefined
  disabled: boolean
  reduceMotion: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  contentId: string
  layoutGroupId: string
  activeIndex: number
  setActiveIndex: (index: number) => void
  optionIds: string[]
  ariaLabel: string
  side: "top" | "bottom"
  setSide: (side: "top" | "bottom") => void
  editingId: string | null
  setEditingId: (id: string | null) => void
  previewId: string | null
  setPreviewId: (id: string | null) => void
  getConfigFor: (model: AiModel) => AiModelSelection
}

function optionDomId(contentId: string, modelId: string) {
  return `${contentId}-option-${modelId}`
}

function firstEnabledIndex(models: AiModel[], optionIds: string[]) {
  for (let i = 0; i < optionIds.length; i++) {
    const model = models.find((m) => m.id === optionIds[i])
    if (model && !model.disabled) return i
  }
  return 0
}

function lastEnabledIndex(models: AiModel[], optionIds: string[]) {
  for (let i = optionIds.length - 1; i >= 0; i--) {
    const model = models.find((m) => m.id === optionIds[i])
    if (model && !model.disabled) return i
  }
  return Math.max(0, optionIds.length - 1)
}

const ModelSelectorContext =
  React.createContext<ModelSelectorContextValue | null>(null)

function useModelSelectorContext(component: string): ModelSelectorContextValue {
  const ctx = React.useContext(ModelSelectorContext)
  if (!ctx) {
    throw new Error(`${component} must be used within <ModelSelector>`)
  }
  return ctx
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function assignRef<T>(
  node: T | null,
  ...refs: Array<React.Ref<T> | undefined>
) {
  for (const ref of refs) {
    if (typeof ref === "function") {
      ref(node)
    } else if (ref) {
      ;(ref as React.MutableRefObject<T | null>).current = node
    }
  }
}

function usePrefersReducedMotion() {
  const [reduceMotion, setReduceMotion] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  return reduceMotion
}

function useControllableState<T>({
  value,
  defaultValue,
  onChange,
}: {
  value: T | undefined
  defaultValue: T
  onChange?: (value: T) => void
}): [T, (next: T | ((prev: T) => T)) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const isControlled = value !== undefined
  const current = isControlled ? value : uncontrolled

  const setValue = React.useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next
      if (!isControlled) setUncontrolled(resolved)
      onChange?.(resolved)
    },
    [isControlled, onChange, current]
  )

  return [current, setValue]
}

export function formatContext(
  context: string | number | undefined
): string | null {
  if (context === undefined || context === "") return null
  if (typeof context === "number") {
    if (context >= 1_000_000) return `${(context / 1_000_000).toFixed(0)}M`
    if (context >= 1_000) return `${Math.round(context / 1_000)}K`
    return String(context)
  }
  return String(context)
}

function defaultSelectionFor(model: AiModel): AiModelSelection {
  return {
    id: model.id,
    effort: model.defaultEffort ?? model.efforts?.[0],
    context:
      formatContext(model.defaultContext ?? model.contexts?.[0]) ?? undefined,
    fast: model.defaultFast ?? false,
    thinking: model.defaultThinking ?? false,
  }
}

function resolveSelection(
  models: AiModel[],
  value?: AiModelSelection
): AiModelSelection {
  const model = models.find((m) => m.id === value?.id) ?? models[0]
  if (!model) {
    return { id: value?.id ?? "" }
  }
  const base = defaultSelectionFor(model)
  if (!value || value.id !== model.id) return base
  return {
    id: model.id,
    effort: value.effort ?? base.effort,
    context: value.context ?? base.context,
    fast: value.fast ?? base.fast,
    thinking: value.thinking ?? base.thinking,
  }
}

/** Renders "Opus 4.5 High Fast" with muted modifiers. */
function ModelLabelParts({
  model,
  selection,
  className,
}: {
  model: AiModel | undefined
  selection: AiModelSelection
  className?: string
}) {
  if (!model) {
    return (
      <span className={cn("text-muted-foreground", className)}>Select model</span>
    )
  }

  const mods: string[] = []
  if (selection.effort) mods.push(EFFORT_LABEL[selection.effort])
  if (selection.fast) mods.push("Fast")
  if (selection.thinking) mods.push("Thinking")

  return (
    <span className={cn("flex min-w-0 items-baseline gap-1.5", className)}>
      <span className="text-foreground truncate font-medium">{model.label}</span>
      {mods.map((mod) => (
        <span
          key={mod}
          className="text-muted-foreground/70 shrink-0 font-medium tabular-nums"
        >
          {mod}
        </span>
      ))}
    </span>
  )
}

function MenuCheckmark({
  visible,
  reduceMotion,
  className,
}: {
  visible: boolean
  reduceMotion: boolean
  className?: string
}) {
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.span
          key="check"
          {...scaleBlurPresence(reduceMotion)}
          className={cn("flex shrink-0", className)}
        >
          <CheckIcon className="size-3.5" aria-hidden />
        </motion.span>
      ) : null}
    </AnimatePresence>
  )
}

function OptionChip({
  selected,
  onClick,
  children,
  disabled,
  reduceMotion,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  disabled?: boolean
  reduceMotion: boolean
}) {
  return (
    <motion.button
      type="button"
      disabled={disabled}
      onClick={onClick}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_rgba(123,123,123,0.16)]"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        disabled && "pointer-events-none opacity-40"
      )}
    >
      <span>{children}</span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <MenuCheckmark
          visible={selected}
          reduceMotion={reduceMotion}
          className="text-foreground"
        />
      </span>
    </motion.button>
  )
}

function ToggleChip({
  selected,
  onClick,
  children,
  reduceMotion,
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
  reduceMotion: boolean
}) {
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        selected
          ? "bg-muted text-foreground shadow-[inset_0_0_0_1px_rgba(123,123,123,0.2)]"
          : "text-muted-foreground/70 hover:bg-muted/70 hover:text-muted-foreground"
      )}
    >
      <span>{children}</span>
      <span className="flex size-3.5 shrink-0 items-center justify-center">
        <MenuCheckmark
          visible={selected}
          reduceMotion={reduceMotion}
          className="text-foreground"
        />
      </span>
    </motion.button>
  )
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function ModelSelector({
  children,
  models = DEFAULT_AI_MODELS,
  value: valueProp,
  defaultValue,
  onValueChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  disabled = false,
  className,
  "aria-label": ariaLabel = "AI models",
}: ModelSelectorProps) {
  const reduceMotion = usePrefersReducedMotion()
  const layoutGroupId = React.useId()
  const contentId = React.useId()
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const contentRef = React.useRef<HTMLDivElement | null>(null)

  const initial =
    defaultValue ?? (models[0] ? defaultSelectionFor(models[0]) : { id: "" })

  const [selection, setSelection] = useControllableState({
    value: valueProp,
    defaultValue: initial,
    onChange: onValueChange,
  })

  const [open, setOpenState] = useControllableState({
    value: openProp,
    defaultValue: defaultOpen,
    onChange: onOpenChange,
  })

  const [activeIndex, setActiveIndex] = React.useState(0)
  const [side, setSide] = React.useState<"top" | "bottom">("top")
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [previewId, setPreviewId] = React.useState<string | null>(null)

  const optionIds = React.useMemo(() => models.map((m) => m.id), [models])

  // Cache last config per model so switching models restores options
  const configCacheRef = React.useRef<Record<string, AiModelSelection>>({})

  // Always expose a fully-resolved selection (fills effort/context/fast defaults)
  const resolved = resolveSelection(models, selection)

  React.useEffect(() => {
    if (resolved.id) configCacheRef.current[resolved.id] = resolved
  }, [resolved])

  const selectedModel = models.find((m) => m.id === resolved.id) ?? models[0]

  const getConfigFor = React.useCallback(
    (model: AiModel): AiModelSelection => {
      if (resolved.id === model.id) return resolved
      return configCacheRef.current[model.id] ?? defaultSelectionFor(model)
    },
    [resolved]
  )

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (disabled && next) return
      setOpenState(next)
      if (!next) {
        setEditingId(null)
        setPreviewId(null)
      }
    },
    [disabled, setOpenState]
  )

  const selectModel = React.useCallback(
    (id: string) => {
      const model = models.find((m) => m.id === id)
      if (!model || model.disabled) return
      const next = resolveSelection(models, { ...getConfigFor(model), id })
      setSelection(next)
      setEditingId(null)
      setOpen(false)
      triggerRef.current?.focus()
    },
    [models, getConfigFor, setSelection, setOpen]
  )

  const patchSelection = React.useCallback(
    (patch: Partial<AiModelSelection>) => {
      setSelection((prev) => {
        const id = patch.id ?? prev.id
        const model = models.find((m) => m.id === id)
        const base = model
          ? id === prev.id
            ? resolveSelection(models, prev)
            : (configCacheRef.current[id] ?? defaultSelectionFor(model))
          : prev
        const next = resolveSelection(models, { ...base, ...patch, id })
        configCacheRef.current[id] = next
        return next
      })
    },
    [models, setSelection]
  )

  React.useEffect(() => {
    if (!open) return
    const idx = optionIds.indexOf(resolved.id)
    setActiveIndex(idx >= 0 ? idx : firstEnabledIndex(models, optionIds))
  }, [open, optionIds, resolved.id, models])

  React.useEffect(() => {
    if (!open) return

    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const inTrigger = triggerRef.current?.contains(target)
      const inContent = contentRef.current?.contains(target)
      if (!inTrigger && !inContent) setOpen(false)
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        if (editingId) {
          setEditingId(null)
          return
        }
        setOpen(false)
        triggerRef.current?.focus()
        return
      }

      if (editingId || optionIds.length === 0) return

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const delta = event.key === "ArrowDown" ? 1 : -1
        setActiveIndex((prev) => {
          let next = prev
          for (let i = 0; i < optionIds.length; i++) {
            next = (next + delta + optionIds.length) % optionIds.length
            const model = models.find((m) => m.id === optionIds[next])
            if (!model?.disabled) break
          }
          return next
        })
        return
      }

      if (event.key === "Enter" || event.key === " ") {
        const target = event.target as HTMLElement | null
        if (target?.closest("[data-slot='model-selector-item']")) return
        if (target?.closest("[data-slot='model-selector-edit']")) return
        event.preventDefault()
        const id = optionIds[activeIndex]
        if (id) selectModel(id)
        return
      }

      if (event.key === "Home") {
        event.preventDefault()
        setActiveIndex(firstEnabledIndex(models, optionIds))
        return
      }
      if (event.key === "End") {
        event.preventDefault()
        setActiveIndex(lastEnabledIndex(models, optionIds))
      }
    }

    document.addEventListener("mousedown", onPointer)
    document.addEventListener("touchstart", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onPointer)
      document.removeEventListener("touchstart", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open, setOpen, optionIds, activeIndex, models, selectModel, editingId])

  React.useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled, setOpen])

  return (
    <ModelSelectorContext.Provider
      value={{
        open,
        setOpen,
        selection: resolved,
        selectModel,
        patchSelection,
        models,
        selectedModel,
        disabled,
        reduceMotion,
        triggerRef,
        contentRef,
        contentId,
        layoutGroupId,
        activeIndex,
        setActiveIndex,
        optionIds,
        ariaLabel,
        side,
        setSide,
        editingId,
        setEditingId,
        previewId,
        setPreviewId,
        getConfigFor,
      }}
    >
      <div
        data-slot="model-selector"
        data-state={open ? "open" : "closed"}
        className={cn("relative inline-flex", className)}
      >
        {children}
      </div>
    </ModelSelectorContext.Provider>
  )
}

ModelSelector.displayName = "ModelSelector"

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

const ModelSelectorTrigger = React.forwardRef<
  HTMLButtonElement,
  ModelSelectorTriggerProps
>(({ className, children, disabled, onClick, ...props }, ref) => {
  const {
    open,
    setOpen,
    triggerRef,
    contentId,
    disabled: rootDisabled,
    selectedModel,
    selection,
  } = useModelSelectorContext("ModelSelectorTrigger")

  const isDisabled = disabled || rootDisabled
  const label = selectedModel
    ? [
        selectedModel.label,
        selection.effort ? EFFORT_LABEL[selection.effort] : null,
        selection.fast ? "Fast" : null,
        selection.thinking ? "Thinking" : null,
      ]
        .filter(Boolean)
        .join(" ")
    : "Select model"

  return (
    <motion.button
      ref={(node) => assignRef(node, ref, triggerRef)}
      type="button"
      disabled={isDisabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={contentId}
      aria-label={`Model: ${label}`}
      data-slot="model-selector-trigger"
      data-state={open ? "open" : "closed"}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || isDisabled) return
        setOpen(!open)
      }}
      whileHover={isDisabled ? undefined : { scale: 1.02, y: -1 }}
      whileTap={isDisabled ? undefined : { scale: 0.96 }}
      transition={SPRING_PRESS}
      className={cn(
        "text-muted-foreground flex min-h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs font-medium",
        "transition-[background-color,color,box-shadow,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        open && "bg-muted text-foreground",
        className
      )}
      {...props}
    >
      {children ?? <ModelSelectorValue />}
      <motion.span
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.2, ease: EASE }}
        className="flex shrink-0"
      >
        <ChevronDownIcon className="size-3.5 opacity-60" aria-hidden />
      </motion.span>
    </motion.button>
  )
})
ModelSelectorTrigger.displayName = "ModelSelectorTrigger"

// ---------------------------------------------------------------------------
// Value
// ---------------------------------------------------------------------------

function ModelSelectorValue({ className, ...props }: ModelSelectorValueProps) {
  const { selectedModel, selection, reduceMotion } =
    useModelSelectorContext("ModelSelectorValue")

  return (
    <span
      data-slot="model-selector-value"
      className={cn("relative flex min-w-0 items-center", className)}
      {...props}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={`${selection.id}-${selection.effort}-${selection.fast}-${selection.thinking}`}
          {...valuePresence(reduceMotion)}
          className="flex min-w-0"
        >
          <ModelLabelParts
            model={selectedModel}
            selection={selection}
            className="text-sm"
          />
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
ModelSelectorValue.displayName = "ModelSelectorValue"

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const ModelSelectorContent = React.forwardRef<
  HTMLDivElement,
  ModelSelectorContentProps
>(({ className, children, side: sideProp = "top", style, ...props }, ref) => {
  const {
    open,
    contentId,
    triggerRef,
    contentRef,
    reduceMotion,
    ariaLabel,
    setSide,
    editingId,
    previewId,
    models,
    activeIndex,
    optionIds,
  } = useModelSelectorContext("ModelSelectorContent")

  const [mounted, setMounted] = React.useState(false)
  const [coords, setCoords] = React.useState<{
    top: number
    left: number
  } | null>(null)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    setSide(sideProp)
  }, [sideProp, setSide])

  React.useLayoutEffect(() => {
    if (!open) return

    const update = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      if (sideProp === "bottom") {
        setCoords({
          top: rect.bottom + 8,
          left: rect.left,
        })
      } else {
        setCoords({
          top: rect.top - 8,
          left: rect.left,
        })
      }
    }

    update()
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, triggerRef, sideProp])

  if (!mounted) return null

  const list = children ?? <ModelSelectorDefaultItems />
  const editingModel = models.find((m) => m.id === editingId)
  const previewModel = models.find((m) => m.id === previewId)
  const panelModel = editingModel ?? previewModel
  const activeModelId = optionIds[activeIndex]
  const activeOptionId = activeModelId
    ? optionDomId(contentId, activeModelId)
    : undefined

  return createPortal(
    <AnimatePresence>
      {open && coords ? (
        <motion.div
          key={contentId}
          ref={(node) => assignRef(node, ref, contentRef)}
          data-slot="model-selector-content"
          data-editing={editingId ? "" : undefined}
          {...menuPresence(reduceMotion)}
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            transform: sideProp === "top" ? "translateY(-100%)" : undefined,
            zIndex: 50,
            ...style,
          }}
          className={cn("flex origin-top-left items-start gap-3", className)}
          {...props}
        >
          <div
            id={contentId}
            role="listbox"
            aria-label={ariaLabel}
            aria-activedescendant={activeOptionId}
            data-slot="model-selector-listbox"
            className="min-w-0"
          >
            {list}
          </div>

          <AnimatePresence initial={false}>
            {panelModel ? (
              <ModelSidePanel
                key="model-side-panel"
                model={panelModel}
                editing={!!editingModel}
              />
            ) : null}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
})
ModelSelectorContent.displayName = "ModelSelectorContent"

// ---------------------------------------------------------------------------
// Default list
// ---------------------------------------------------------------------------

function ModelSelectorDefaultItems() {
  const { models, layoutGroupId, reduceMotion, editingId, setPreviewId } =
    useModelSelectorContext("ModelSelectorDefaultItems")

  return (
    <LayoutGroup id={layoutGroupId}>
      <motion.ul
        role="presentation"
        variants={listVariants}
        initial={reduceMotion ? false : "hidden"}
        animate="show"
        className={cn(MENU_PANEL_CLASS, "flex min-w-64 flex-col gap-0.5")}
        onMouseLeave={() => {
          if (!editingId) setPreviewId(null)
        }}
      >
        {models.map((model) => (
          <li key={model.id} role="none">
            <ModelSelectorItem model={model} />
          </li>
        ))}
      </motion.ul>
    </LayoutGroup>
  )
}

// ---------------------------------------------------------------------------
// Stable side panel shell
// ---------------------------------------------------------------------------

function ModelSidePanel({
  model,
  editing,
}: {
  model: AiModel
  editing: boolean
}) {
  const { reduceMotion } = useModelSelectorContext("ModelSidePanel")

  return (
    <motion.aside
      data-slot="model-selector-side-panel"
      aria-label={
        editing ? `${model.label} settings` : `${model.label} details`
      }
      {...flyoutPresence(reduceMotion)}
      className={cn(MENU_PANEL_CLASS, "flex w-56 shrink-0 flex-col gap-3 p-3")}
    >
      {editing ? (
        <ModelEditPanelContent model={model} />
      ) : (
        <ModelInfoPanelContent model={model} />
      )}
    </motion.aside>
  )
}

// ---------------------------------------------------------------------------
// Hover info side panel
// ---------------------------------------------------------------------------

function ModelInfoPanelContent({ model }: { model: AiModel }) {
  const contexts = model.contexts
    ?.map((context) => formatContext(context))
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <div className="text-foreground text-sm font-semibold">{model.label}</div>
      {model.description ? (
        <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
          {model.description}
        </p>
      ) : null}
      {contexts ? (
        <div className="mt-1 flex flex-col gap-1">
          <span className="text-muted-foreground/70 text-[10px] font-semibold tracking-wide uppercase">
            Context
          </span>
          <span className="text-muted-foreground text-xs font-medium tabular-nums">
            {contexts}
          </span>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Edit side panel
// ---------------------------------------------------------------------------

function ModelEditPanelContent({ model }: { model: AiModel }) {
  const { getConfigFor, patchSelection, reduceMotion } =
    useModelSelectorContext("ModelEditPanelContent")

  const config = getConfigFor(model)
  const efforts = model.efforts ?? []
  const contexts = model.contexts ?? []

  return (
    <>
      {efforts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Effort
          </div>
          <div className="flex flex-col gap-0.5">
            {efforts.map((effort) => (
              <OptionChip
                key={effort}
                selected={config.effort === effort}
                reduceMotion={reduceMotion}
                onClick={() => patchSelection({ id: model.id, effort })}
              >
                {EFFORT_LABEL[effort]}
              </OptionChip>
            ))}
          </div>
        </div>
      ) : null}

      {contexts.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Context
          </div>
          <div className="flex flex-col gap-0.5">
            {contexts.map((ctx) => {
              const label = formatContext(ctx) ?? String(ctx)
              return (
                <OptionChip
                  key={label}
                  selected={config.context === label}
                  reduceMotion={reduceMotion}
                  onClick={() =>
                    patchSelection({ id: model.id, context: label })
                  }
                >
                  <span className="tabular-nums">{label}</span>
                </OptionChip>
              )
            })}
          </div>
        </div>
      ) : null}

      {(model.supportsFast || model.supportsThinking) && (
        <div className="flex flex-col gap-1.5">
          <div className="text-muted-foreground/70 px-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Modes
          </div>
          <div className="flex flex-col gap-0.5">
            {model.supportsFast ? (
              <ToggleChip
                selected={!!config.fast}
                reduceMotion={reduceMotion}
                onClick={() =>
                  patchSelection({ id: model.id, fast: !config.fast })
                }
              >
                Fast
              </ToggleChip>
            ) : null}
            {model.supportsThinking ? (
              <ToggleChip
                selected={!!config.thinking}
                reduceMotion={reduceMotion}
                onClick={() =>
                  patchSelection({
                    id: model.id,
                    thinking: !config.thinking,
                  })
                }
              >
                Thinking
              </ToggleChip>
            ) : null}
          </div>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

function ModelSelectorItem({ model }: { model: AiModel }) {
  const {
    selection,
    selectModel,
    reduceMotion,
    layoutGroupId,
    contentId,
    activeIndex,
    setActiveIndex,
    optionIds,
    editingId,
    setEditingId,
    setPreviewId,
    getConfigFor,
    patchSelection,
  } = useModelSelectorContext("ModelSelectorItem")

  const isActive = model.id === selection.id
  const isEditing = editingId === model.id
  const optionIndex = optionIds.indexOf(model.id)
  const isHighlighted = optionIndex === activeIndex && optionIndex >= 0
  const isDisabled = !!model.disabled
  const config = getConfigFor(model)
  const optionId = optionDomId(contentId, model.id)

  const optionRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    if (isHighlighted) {
      optionRef.current?.scrollIntoView({ block: "nearest" })
    }
  }, [isHighlighted])

  return (
    <motion.div
      variants={reduceMotion ? itemVariantsReduced : itemVariants}
      className={cn(
        "group/item relative flex w-full items-center gap-1 rounded-xl",
        "transition-colors duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        isActive ? "text-foreground" : "text-muted-foreground",
        isHighlighted && !isActive && "bg-muted/50",
        isEditing && "bg-muted/80",
        isDisabled && "pointer-events-none opacity-40"
      )}
      onMouseEnter={() => {
        if (!isDisabled && optionIndex >= 0) {
          setActiveIndex(optionIndex)
          if (!editingId) setPreviewId(model.id)
        }
      }}
    >
      {isActive ? (
        <motion.span
          layoutId={`${layoutGroupId}-active`}
          className="bg-muted absolute inset-0 rounded-xl"
          transition={SPRING_SOFT}
        />
      ) : null}

      {/* Option has no nested buttons — Edit is a sibling for valid listbox a11y. */}
      <div
        ref={optionRef}
        id={optionId}
        role="option"
        aria-selected={isActive}
        aria-disabled={isDisabled || undefined}
        data-slot="model-selector-item"
        data-highlighted={isHighlighted ? "" : undefined}
        data-active={isActive ? "" : undefined}
        data-editing={isEditing ? "" : undefined}
        onClick={() => {
          if (!isDisabled) selectModel(model.id)
        }}
        className={cn(
          "relative z-10 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left",
          "transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          !isDisabled && "active:scale-[0.98]"
        )}
      >
        <span className="min-w-0 flex-1">
          <ModelLabelParts
            model={model}
            selection={config}
            className="text-sm"
          />
        </span>
        {isActive ? (
          <MenuCheckmark
            visible
            reduceMotion={reduceMotion}
            className="text-foreground"
          />
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
      </div>

      <motion.button
        type="button"
        data-slot="model-selector-edit"
        aria-label={`Edit ${model.label} settings`}
        aria-expanded={isEditing}
        disabled={isDisabled}
        onClick={(event) => {
          event.stopPropagation()
          if (isEditing) {
            setEditingId(null)
            return
          }
          // Opening edit selects this model’s config into the active selection
          // so the panel edits the live value, without closing the list.
          patchSelection({ ...config, id: model.id })
          setEditingId(model.id)
        }}
        whileTap={isDisabled ? undefined : { scale: 0.96 }}
        transition={SPRING_PRESS}
        className={cn(
          "relative z-10 mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg",
          "text-muted-foreground/70 opacity-0 transition-[opacity,background-color,color] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
          "hover:bg-accent hover:text-foreground",
          "focus-visible:ring-ring/50 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:outline-none",
          "group-hover/item:opacity-100",
          (isEditing || isHighlighted) && "opacity-100",
          isEditing && "bg-accent text-foreground"
        )}
      >
        <PencilIcon className="size-3.5" aria-hidden />
      </motion.button>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Kit
// ---------------------------------------------------------------------------

function ModelSelectorKit({
  models = DEFAULT_AI_MODELS,
  value,
  defaultValue,
  onValueChange,
  disabled,
  className,
  "aria-label": ariaLabel,
}: ModelSelectorKitProps) {
  return (
    <ModelSelector
      models={models}
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      disabled={disabled}
      className={className}
      aria-label={ariaLabel}
    >
      <ModelSelectorTrigger>
        <ModelSelectorValue />
      </ModelSelectorTrigger>
      <ModelSelectorContent />
    </ModelSelector>
  )
}
ModelSelectorKit.displayName = "ModelSelectorKit"

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  ModelSelector,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorKit,
  defaultSelectionFor,
}

export default ModelSelectorKit


demo.tsx
"use client"

import * as React from "react"

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorTrigger,
  ModelSelectorValue,
  type AiModelSelection,
} from "@/components/ui/ai-model-select"

// ONLY DEFAULT EXPORT WILL BE TREATED AS A DEMO
export default function DemoOne() {
  const [selection, setSelection] = React.useState<AiModelSelection>({
    id: "opus-4.5",
    effort: "high",
    context: "200K",
    fast: true,
    thinking: false,
  })

  const summary = [
    selection.id,
    selection.effort,
    selection.fast ? "fast" : null,
    selection.thinking ? "thinking" : null,
    selection.context,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="flex w-full max-w-lg flex-col items-center justify-center gap-6 px-2 py-10">
      <ModelSelector value={selection} onValueChange={setSelection}>
        <ModelSelectorTrigger className="bg-muted min-h-10 rounded-2xl border-2 border-border px-3 py-2">
          <ModelSelectorValue className="text-sm" />
        </ModelSelectorTrigger>
        <ModelSelectorContent side="bottom" />
      </ModelSelector>
      <p className="text-muted-foreground text-center text-xs tabular-nums">
        {summary}
      </p>
    </div>
  )
}

```

Install NPM dependencies:
```bash
clsx, lucide-react, framer-motion, tailwind-merge
```

Implementation Guidelines
 1. Analyze the component structure and identify all required dependencies
 2. Review the component's argumens and state
 3. Identify any required context providers or hooks and install them
 4. Questions to Ask
 - What data/props will be passed to this component?
 - Are there any specific state management requirements?
 - Are there any required assets (images, icons, etc.)?
 - What is the expected responsive behavior?
 - What is the best place to use this component in the app?

Steps to integrate
 0. Copy paste all the code above in the correct directories
 1. Install external dependencies
 2. Fill image assets with Unsplash stock images you know exist
 3. Use lucide-react icons for svgs or logos if component requires them

