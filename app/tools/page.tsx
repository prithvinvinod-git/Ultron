"use client";

import { useEffect, useState } from "react";
import { MessageCircle, ShieldAlert, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolMeta {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requiresApproval: boolean;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tools")
      .then((res) => res.json())
      .then((data) => setTools(data.tools ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center gap-4">
        <div className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-brand-bright">
          <Wrench size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Tools</h1>
          <p className="text-sm text-mist">
            {tools.length} tools available to Ultron — invoked automatically during chat
          </p>
        </div>
      </header>

      <div className="mb-5 flex items-start gap-2 rounded-2xl border border-sigil/30 bg-sigil/10 p-3 text-sm text-graphite">
        <MessageCircle size={16} className="mt-0.5 shrink-0 text-sigil" />
        <span>
          These run inside{" "}
          <span className="font-medium text-sigil">/chat</span>. Try:{" "}
          <em>&quot;what time is it?&quot;</em>,{" "}
          <em>&quot;what&apos;s 1984 × 0.375 ÷ 2?&quot;</em>,{" "}
          <em>&quot;search the web for…&quot;</em>, or{" "}
          <em>&quot;remember that…&quot;</em>.
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-mist">Loading…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tools.map((tool) => {
            const params = tool.parameters as {
              required?: string[];
              properties?: Record<string, { description?: string; type?: string }>;
            };
            const props = params.properties ?? {};
            const keys = Object.keys(props);
            return (
              <div
                key={tool.name}
                className="glass animate-rise rounded-2xl p-4 transition hover:border-border-strong"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-lg bg-surface-3 px-2 py-0.5 font-mono text-[13px] font-semibold text-brand-bright">
                    {tool.name}
                  </code>
                  {tool.requiresApproval && (
                    <span className="flex items-center gap-1 rounded-full border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn">
                      <ShieldAlert size={11} />
                      requires approval
                    </span>
                  )}
                  {keys.length === 0 && (
                    <span className="text-[11px] text-mist">no arguments</span>
                  )}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-graphite">
                  {tool.description}
                </p>
                {keys.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {keys.map((key) => (
                      <span
                        key={key}
                        className={cn(
                          "flex items-center gap-1 rounded-md border px-1.5 py-0.5 font-mono text-[11px]",
                          params.required?.includes(key)
                            ? "border-brand/40 text-brand-bright"
                            : "border-border text-mist",
                        )}
                        title={props[key]?.description}
                      >
                        {key}
                        {params.required?.includes(key) && <span>*</span>}
                        {props[key]?.type ? `: ${props[key]?.type}` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}