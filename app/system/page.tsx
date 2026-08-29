"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Cpu,
  Database,
  Mic,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemInfo {
  ok: boolean;
  name: string;
  now: string;
  host: {
    platform: string;
    arch: string;
    release: string;
    hostname: string;
    cpus: number;
    memoryMb: number;
    uptimeSec: number;
    node: string;
  };
  db: {
    engine: string;
    url: string;
    sessions: number;
    messages: number;
    memories: number;
  };
  providers: Array<{
    name: string;
    label: string;
    configured: boolean;
    active: boolean;
    priority: number;
    defaultModel: string;
    docs?: string;
  }>;
  voice: { tts: string[]; stt: string[] };
  features: Record<string, boolean | string>;
  killSwitch: { armed: boolean; note: string };
}

export default function SystemPage() {
  const [info, setInfo] = useState<SystemInfo | null>(null);

  const load = useCallback(() => {
    fetch("/api/system")
      .then((res) => res.json())
      .then((data) => setInfo(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!info) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-mist">
        Loading system status…
      </div>
    );
  }
  if (!info) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-bad">
        Failed to load system info.
      </div>
    );
  }

  const uptime = Math.floor(info.host.uptimeSec / 60);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center gap-4">
        <div className="glass flex h-11 w-11 items-center justify-center rounded-2xl text-brand-bright">
          <Activity size={20} />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">System</h1>
          <p className="text-sm text-mist">
            {info.name} · {info.db.engine} · uptime ~{uptime} min
          </p>
        </div>
        <button
          onClick={load}
          className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-ink transition hover:border-border-strong hover:bg-surface-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className="glass rounded-2xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Server size={15} className="text-brand-bright" /> Host
          </h2>
          <dl className="space-y-1.5 font-mono text-[13px]">
            <Row label="Platform" value={`${info.host.platform} ${info.host.arch}`} />
            <Row label="Hostname" value={info.host.hostname} />
            <Row label="CPU" value={`${info.host.cpus} cores`} />
            <Row label="RAM" value={`${info.host.memoryMb} MB`} />
            <Row label="Node" value={info.host.node} />
          </dl>
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Database size={15} className="text-sigil" /> Database
          </h2>
          <dl className="space-y-1.5 font-mono text-[13px]">
            <Row label="Engine" value={info.db.engine} />
            <Row label="Sessions" value={String(info.db.sessions)} />
            <Row label="Messages" value={String(info.db.messages)} />
            <Row label="Memories" value={String(info.db.memories)} />
          </dl>
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Cpu size={15} className="text-sigil" /> LLM providers
          </h2>
          <div className="flex flex-col gap-2">
            {info.providers.map((provider) => (
              <div
                key={provider.name}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <span>{provider.label}</span>
                    {provider.configured ? (
                      <span className="text-[11px] text-good">configured</span>
                    ) : (
                      <span className="text-[11px] text-warn">no API key</span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-mist">
                    {provider.defaultModel}
                  </div>
                </div>
                {provider.docs && (
                  <a
                    href={provider.docs}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-brand-bright hover:underline"
                  >
                    docs
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <Mic size={15} className="text-brand-bright" /> Voice
          </h2>
          <div className="flex flex-col gap-2">
            <StatusLine
              label="Text to speech"
              services={info.voice.tts.length ? info.voice.tts : ["browser-fallback"]}
              ok={info.voice.tts.length > 0}
            />
            <StatusLine label="Speech to text" services={info.voice.stt} ok />
            <p className="pt-1 text-[11px] text-mist">
              Realtime live conversation is a Phase 1 feature on top of this base
              (plan: LiveKit rooms + streaming STT/TTS).
            </p>
          </div>
        </section>

        <section className="glass rounded-2xl p-4 md:col-span-2">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck size={15} className={info.killSwitch.armed ? "text-warn" : "text-good"} />
            Safety
          </h2>
          <p className="text-sm leading-relaxed text-graphite">{info.killSwitch.note}</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-mist">
            <ShieldAlert size={14} className="text-mist" />
            Destructive or life-affecting actions always require explicit approval.
          </div>
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0 text-mist">{label}</dt>
      <dd className="min-w-0 truncate text-ink">{value}</dd>
    </div>
  );
}

function StatusLine({
  label,
  services,
  ok,
}: {
  label: string;
  services: string[];
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-surface/50 px-3 py-2">
      <span className="text-sm text-ink">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-graphite">
          {services.join(" · ")}
        </span>
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            ok ? "bg-good shadow-[0_0_8px_var(--color-good)]" : "bg-warn",
          )}
        />
      </span>
    </div>
  );
}