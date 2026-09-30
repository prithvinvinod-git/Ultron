"use client";

import * as React from "react";

import { ModelSelectorKit, type AiModel } from "@/components/ui/ai-model-select";
import { VoicePicker, type VoiceOption } from "@/components/ui/voice-picker";
import {
  useSettings,
  writeSettings,
  type AppSettings,
} from "@/lib/settings";
import { useIsClient } from "@/lib/use-is-client";

interface CatalogProvider {
  name: string;
  label: string;
  configured: boolean;
  defaultModel: string;
  models: Array<{ id: string; label: string; description: string }>;
}

export default function SettingsPage() {
  // The store reads localStorage, so the server snapshot is the defaults and
  // React swaps in the real values without a hydration mismatch.
  const settings = useSettings();
  const mounted = useIsClient();
  const [voices, setVoices] = React.useState<VoiceOption[]>([]);
  const [providers, setProviders] = React.useState<CatalogProvider[]>([]);

  // Both of these are store-free and edge-cached, so opening Settings costs
  // nothing against the database quota.
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/voice/voices")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { voices?: VoiceOption[] } | null) => {
        if (!cancelled && data?.voices) setVoices(data.voices);
      })
      .catch(() => {});
    fetch("/api/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { providers?: CatalogProvider[] } | null) => {
        if (!cancelled && data?.providers) setProviders(data.providers);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const update = (patch: Partial<AppSettings>) => writeSettings(patch);

  /** The selected model is stored flat, so the picker is fed provider+model. */
  const models: AiModel[] = React.useMemo(() => {
    const out: AiModel[] = [];
    for (const provider of providers) {
      for (const model of provider.models) {
        out.push({
          // Namespaced so the model id alone identifies provider + model.
          id: `${provider.name}/${model.id}`,
          label: model.label,
          description: model.description,
          disabled: !provider.configured,
        });
      }
    }
    return out;
  }, [providers]);

  const activeProvider = providers.find((p) => p.name === settings.provider);
  const modelId = settings.model
    ? `${settings.provider}/${settings.model}`
    : activeProvider
      ? `${activeProvider.name}/${activeProvider.defaultModel}`
      : "";
  const selection = { id: modelId };

  const onModelChange = (next: { id: string }) => {
    const slash = next.id.indexOf("/");
    if (slash < 0) {
      update({ provider: "", model: "" });
      return;
    }
    update({ provider: next.id.slice(0, slash), model: next.id.slice(slash + 1) });
  };

  const canSpeak = voices.length > 0 || mounted;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E9EC]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#8b8d95]">
          Saved in this browser. Changes apply to the next message.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold tracking-wide uppercase text-[#8b8d95]">
          Model
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <ModelSelectorKit
            models={models}
            value={selection}
            onValueChange={onModelChange}
            aria-label="AI model"
          />
          {providers.some((p) => !p.configured) && (
            <span className="text-xs text-[#8b8d95]">
              Unavailable providers need an API key.
            </span>
          )}
        </div>
        <p className="mt-2 text-xs text-[#8b8d95]">
          {settings.provider
            ? `Ultron will answer with ${activeProvider?.label ?? settings.provider}.`
            : "Letting Ultron pick the fastest healthy provider."}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xs font-semibold tracking-wide uppercase text-[#8b8d95]">
          Voice
        </h2>
        {canSpeak ? (
          <>
            <VoicePicker
              voices={voices}
              voiceKey={settings.voiceKey}
              onChange={(key) => update({ voiceKey: key })}
            />
            <p className="mt-2 text-xs text-[#8b8d95]">
              {voices.length
                ? `${voices.length} voices available.`
                : "Loading voices…"}
            </p>
          </>
        ) : (
          <p className="text-sm text-[#8b8d95]">Loading voices…</p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide uppercase text-[#8b8d95]">
          Behaviour
        </h2>
        <div className="divide-y divide-[#26282d] overflow-hidden rounded-2xl border border-[#2A2C31]">
          <Toggle
            label="Speak replies"
            hint="Read assistant answers out loud as they arrive."
            checked={settings.speakReplies}
            onChange={(v) => update({ speakReplies: v })}
          />
          <Toggle
            label="Allow barge-in"
            hint="Interrupt Ultron mid-sentence by speaking. The microphone hears itself, so leave this off if the assistant cuts itself off."
            checked={settings.bargeIn}
            onChange={(v) => update({ bargeIn: v })}
          />
          <Toggle
            label="Confirm spoken turns"
            hint="Put dictated text in the composer for review instead of sending it as soon as you release the mic."
            checked={settings.confirmVoice}
            onChange={(v) => update({ confirmVoice: v })}
          />
        </div>
      </section>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-[#D1D5DB]">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-[#8b8d95]">
          {hint}
        </span>
      </span>
      <span
        className={
          checked
            ? "relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-brand-bright transition-colors"
            : "relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-[#3A3D44] transition-colors"
        }
      >
        <span
          className={
            checked
              ? "absolute top-0.5 left-4.5 h-4 w-4 rounded-full bg-[#17140f] transition-all"
              : "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-[#8b8d95] transition-all"
          }
        />
      </span>
    </button>
  );
}
