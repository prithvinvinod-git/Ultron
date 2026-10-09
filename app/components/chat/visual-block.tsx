"use client";

import { useMemo, useState } from "react";
import { Maximize2, Minimize2, Play, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@/lib/utils";

type VizSpec =
  | { type: "line"; title?: string; x?: number[]; y: number[]; labels?: string[] }
  | { type: "bar"; title?: string; labels: string[]; values: number[] }
  | { type: "matrix"; title?: string; values: number[][] }
  | { type: "vector"; title?: string; values: number[] }
  | { type: "equation"; title?: string; latex: string };

function isVizSpec(value: unknown): value is VizSpec {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return ["line", "bar", "matrix", "vector", "equation"].includes(String(type));
}

export function parseVizSpec(source: string): VizSpec | null {
  try {
    const value: unknown = JSON.parse(source);
    return isVizSpec(value) ? value : null;
  } catch {
    return null;
  }
}

export function VisualizationBlock({ spec }: { spec: VizSpec }) {
  const [scale, setScale] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const title = spec.title ?? "Interactive visualization";
  const points = spec.type === "line" ? spec.y : spec.type === "bar" ? spec.values : [];
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);

  return (
    <section className={cn("my-3 overflow-hidden rounded-xl border border-border/80 bg-card", expanded && "fixed inset-4 z-50 flex flex-col shadow-2xl")} aria-label={title}>
      <header className="flex items-center justify-between gap-2 border-b border-border/70 bg-muted/30 px-3 py-2">
        <span className="text-xs font-medium text-foreground">{title}</span>
        <div className="flex items-center gap-1">
          {(spec.type === "line" || spec.type === "bar") && (
            <>
              <button type="button" onClick={() => setScale((value) => Math.max(0.8, value - 0.2))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Zoom out"><ZoomOut className="size-3.5" /></button>
              <button type="button" onClick={() => setScale((value) => Math.min(2, value + 0.2))} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Zoom in"><ZoomIn className="size-3.5" /></button>
            </>
          )}
          <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={expanded ? "Exit fullscreen" : "Open fullscreen"}>{expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
        </div>
      </header>
      <div className={cn("overflow-auto p-3", expanded && "flex-1")}>
        {(spec.type === "line" || spec.type === "bar") && points.length > 0 ? (
          <svg viewBox="0 0 560 240" className="h-auto min-w-[420px] w-full" role="img" aria-label={`${title}: ${points.join(", ")}`} style={{ transform: `scale(${scale})`, transformOrigin: "left center" }}>
            <line x1="40" y1="205" x2="540" y2="205" className="stroke-border" />
            <line x1="40" y1="20" x2="40" y2="205" className="stroke-border" />
            {spec.type === "line" ? <polyline fill="none" className="stroke-primary" strokeWidth="3" points={points.map((value, index) => `${40 + (index * 500) / Math.max(points.length - 1, 1)},${195 - ((value - min) / Math.max(max - min, 1)) * 165}`).join(" ")} /> : points.map((value, index) => { const width = 420 / points.length; const height = ((value - min) / Math.max(max - min, 1)) * 165; return <rect key={index} x={50 + index * width} y={195 - height} width={Math.max(width - 8, 4)} height={height} rx="3" className="fill-primary/80" />; })}
          </svg>
        ) : spec.type === "matrix" ? (
          <div className="overflow-auto"><table className="mx-auto border-collapse font-mono text-sm"><tbody>{spec.values.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, colIndex) => <td key={colIndex} className="border border-border px-4 py-2 text-center text-foreground">{value}</td>)}</tr>)}</tbody></table></div>
        ) : spec.type === "vector" ? (
          <div className="flex flex-wrap items-center justify-center gap-2 font-mono text-sm text-foreground">[ {spec.values.map((value, index) => <span key={index} className="rounded bg-muted px-2 py-1">{value}</span>)} ]</div>
        ) : (
          <div className="rounded-lg bg-muted/40 px-4 py-6 text-center font-mono text-lg text-foreground">{spec.type === "equation" ? spec.latex : "No data"}</div>
        )}
      </div>
    </section>
  );
}

export function HtmlPreview({ source }: { source: string }) {
  const [live, setLive] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const srcDoc = useMemo(() => source, [source]);
  return (
    <div className={cn("my-3 overflow-hidden rounded-xl border border-border/80 bg-card", expanded && "fixed inset-4 z-50 flex flex-col shadow-2xl")}>
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-1 rounded-md bg-muted p-0.5 text-[11px]"><button type="button" onClick={() => setLive(false)} className={cn("rounded px-2 py-1", !live && "bg-background text-foreground shadow-sm")}>Code</button><button type="button" onClick={() => setLive(true)} className={cn("flex items-center gap-1 rounded px-2 py-1", live && "bg-background text-foreground shadow-sm")}><Play className="size-3" />Live</button></div>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={expanded ? "Exit fullscreen" : "Open fullscreen"}>{expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
      </div>
      {live ? <iframe title="Live HTML preview" sandbox="allow-scripts" srcDoc={srcDoc} className={cn("h-72 w-full bg-white", expanded && "flex-1 h-auto")} /> : <pre className="max-h-96 overflow-auto p-4 text-xs leading-relaxed text-foreground"><code>{source}</code></pre>}
    </div>
  );
}

export type { VizSpec };
