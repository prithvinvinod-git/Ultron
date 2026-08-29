# Project IRON — Build Workplan

**Intelligent Responsive Orchestrator & Nexus**
A multi-agent dev/task orchestrator: a control plane that assigns coding/dev tasks to AI agents backed by different LLM providers, executes them, and streams their progress live to a dashboard.

This file is a working prompt for `opencode`. Read it fully before writing code. Work phase by phase, in order — do not skip ahead. After each phase: run typecheck/lint, commit with a message referencing the phase, and post a short summary of what changed before starting the next phase.

---

## 1. Stack & role of each piece

| Piece | Role |
|---|---|
| **Next.js 14+ (App Router)** | Dashboard UI + API routes. Task board, agent config, live run viewer. |
| **Vercel** | Deploy target. Serverless/edge functions, cron for queue polling if needed. |
| **Gemini / Grok / OpenRouter** | Pluggable LLM backends for agents, behind one provider interface. |
| **Upstash (Redis)** | Task queue, per-provider rate limiting, pub/sub for live event fan-out. |
| **Turso (libSQL)** | Durable store: workspaces, agents, tasks, runs, logs, provider configs. |
| **LiveKit** | Real-time transport for streaming a running agent's output (tool calls, diffs, terminal output) to the dashboard as it happens. |

The source doc's architecture diagram was empty, so the data model and component boundaries below are a proposed starting point, not a fixed spec. Flag anything that seems wrong for the actual intent, but don't stall on it — pick the reasonable default and note the assumption in your phase summary.

---

## 2. Core data model

- **Workspace** — a project/repo the orchestrator manages.
- **Agent** — a configured worker: provider, model, system prompt, allowed tools, rate-limit tier.
- **Task** — a unit of work, belongs to a Workspace, assigned to an Agent, has status (`queued`/`running`/`done`/`failed`) and optional dependencies on other tasks.
- **Run** — one execution of a Task: start/end time, status, token usage, cost estimate.
- **LogEvent** — a streamed event within a Run (tool call, file diff, message, error). Persist a compact summary per Run in Turso; the live moment-to-moment stream goes over LiveKit/Upstash and doesn't need full durability.
- **ProviderConfig** — API keys and settings per LLM provider, scoped to a Workspace.

Use Drizzle ORM against Turso (or an equivalent typed query layer) — decide and note the choice in Phase 1.

---

## 3. Build phases

### Phase 0 — Scaffolding
- Init Next.js 14 App Router + TypeScript + Tailwind.
- Folder structure: `/app`, `/lib`, `/server`, `/db`, `/agents`, `/components`.
- `.env.example` covering all provider keys, Upstash, Turso, LiveKit credentials.
- Lint + typecheck scripts wired up; confirm both run clean on empty scaffold.

### Phase 1 — Data layer
- Define schema for the entities in §2.
- Migrations (drizzle-kit or equivalent) + a seed script with one sample workspace/agent/task.
- Note ORM choice and why.

### Phase 2 — LLM provider abstraction
- One `Provider` interface: chat/completion, streaming, tool-calling.
- Adapters for Gemini, Grok (x.ai), OpenRouter behind that interface.
- Central router that picks a provider from Agent config and falls back to a secondary provider on error or rate-limit.
- Per-provider rate limiting via Upstash.

### Phase 3 — Agent execution engine
- Enqueue: Task → Upstash queue.
- Worker (Vercel function or Upstash QStash consumer — decide and note) dequeues, instantiates the Agent with its Provider, executes with a limited toolset (file read/write in a sandboxed workspace, shell, git).
- **Open decision, needs a default:** where agent code execution actually happens (local disk sandbox vs. container vs. remote sandbox service). Pick the simplest option that unblocks Phase 3 — e.g. a scoped temp directory per Run — and flag it clearly as needing review before anything touches a real repo.
- Emit LogEvents in real time to a LiveKit room (or an Upstash-pub/sub-backed SSE endpoint as a simpler first cut).
- On completion, persist the Run summary + final result to Turso.

### Phase 4 — Real-time dashboard
- Task board: queued / running / done / failed columns.
- Agent detail view with live log stream (subscribe to the LiveKit room or SSE endpoint from Phase 3).
- CRUD for Agents (provider, model, system prompt, allowed tools) and Tasks.

### Phase 5 — Orchestration logic
- Task dependencies: sequential/parallel execution ordering.
- Retry policy on Run failure.
- Cost/token tracking rolled up per Task and per Workspace.

### Phase 6 — Auth (flag as open)
- Multi-tenancy needed? If yes, pick an auth provider (NextAuth/Clerk) and note the choice. If this isn't needed yet, stub a single-user mode and move on rather than blocking here.

### Phase 7 — Deploy & harden
- Vercel deploy config, env secrets checklist.
- Minimal test coverage for the provider router and the queue worker (these are the two places a silent failure is expensive).
- Basic structured logging/monitoring hook.

---

## 4. Environment variables (fill in as each phase needs them)

```
# LLM providers
GEMINI_API_KEY=
GROK_API_KEY=
OPENROUTER_API_KEY=

# Upstash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Turso
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# LiveKit
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
```

---

## 5. Working instructions for the agent

- TypeScript everywhere, strict mode on.
- Small commits per logical step within a phase, not one giant commit at the end.
- When a decision in this doc is marked "open" or "needs a default," make the call, implement it, and say what you chose and why — don't pause and wait unless it's genuinely destructive (e.g. anything that would execute untrusted code outside a sandbox, or touch real credentials).
- Don't build Phase N+1 on top of an untested assumption from Phase N — verify the schema, the provider router, and the queue each work in isolation before wiring the dashboard to them.
- If a stack piece (LiveKit, Turso, Upstash) turns out to need a paid tier or account setup you can't complete, stub its interface, keep building against the stub, and say clearly what's stubbed.
