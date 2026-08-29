"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryRow {
  id: string;
  kind: string;
  scope: string;
  summary: string;
  detail: string;
  tags: string[];
  importance: number;
  createdAt: string | number | Date;
}

const KIND_STYLES: Record<string, string> = {
  fact: "text-sigil border-sigil/30 bg-sigil/10",
  preference: "text-brand-bright border-brand/40 bg-brand/15",
  decision: "text-warn border-warn/30 bg-warn/10",
};

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/memory")
      .then((res) => res.json())
      .then((data) => setMemories(data.memories ?? []))
      .catch(() => setStatus("Failed to load memories."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const s = summary.trim();
    if (!s) return;
    setStatus(null);
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: s,
        detail: detail.trim(),
        kind: "fact",
        tags: [],
        importance: 2,
      }),
    });
    if (res.ok) {
      setSummary("");
      setDetail("");
      load();
    } else {
      const data = await res.json().catch(() => null);
      setStatus(data?.error ?? "Failed to store memory.");
    }
  };

  const remove = async (id: string) => {
    await fetch(`/api/memory?id=${id}`, { method: "DELETE" });
    load();
  };

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? memories.filter(
        (m) =>
          m.summary.toLowerCase().includes(needle) ||
          m.detail.toLowerCase().includes(needle) ||
          m.tags.join(" ").toLowerCase().includes(needle) ||
          m.kind.includes(needle),
      )
    : memories;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center gap-4">
        <div className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-brand-bright">
          <Database size={20} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Memory</h1>
          <p className="text-sm text-mist">
            {memories.length} stored {memories.length === 1 ? "memory" : "memories"} · auto-recalled by Ultron
          </p>
        </div>
      </header>

      <div className="glass mb-4 flex items-center gap-2 rounded-2xl px-3 py-2">
        <Search size={16} className="shrink-0 text-mist" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search memories…"
          className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-mist"
        />
      </div>

      <div className="glass mb-6 flex flex-col gap-2 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Plus size={15} className="shrink-0 text-brand-bright" />
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void add();
            }}
            placeholder='Add a memory ("the user prefers dark themes")'
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-mist"
          />
          <button
            onClick={() => void add()}
            disabled={!summary.trim()}
            className={cn(
              "shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-ink transition",
              summary.trim()
                ? "border-brand/50 hover:bg-surface-3"
                : "opacity-40",
            )}
          >
            Store
          </button>
        </div>
        {detail.trim() && (
          <input
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Detail (optional)"
            className="bg-transparent pl-7 text-sm text-graphite outline-none placeholder:text-mist"
          />
        )}
      </div>

      {status && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {status}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-mist">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-mist">
          {needle ? "No memories match." : "No memories yet. Ask Ultron to remember something, or add one above."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((memory) => (
            <div
              key={memory.id}
              className="glass animate-rise group rounded-2xl p-4 transition hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                        KIND_STYLES[memory.kind] ?? KIND_STYLES.fact,
                      )}
                    >
                      {memory.kind}
                    </span>
                    {memory.scope !== "global" && (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-mist">
                        {memory.scope}
                      </span>
                    )}
                    {memory.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-graphite"
                      >
                        #{tag}
                      </span>
                    ))}
                    <span className="text-[11px] text-mist">
                      ★ {memory.importance}
                    </span>
                  </div>
                  <p className="text-sm text-ink">{memory.summary}</p>
                  {memory.detail && (
                    <p className="mt-1 text-[13px] text-graphite">{memory.detail}</p>
                  )}
                </div>
                <button
                  onClick={() => void remove(memory.id)}
                  className="shrink-0 text-mist opacity-0 transition hover:text-bad group-hover:opacity-100"
                  aria-label="Delete memory"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}