# Project IRON — Features Catalog

Everything the build plan already implies, plus a brainstorm of what's missing — including features pulled from JARVIS and Ultron that are actually buildable with this stack (Next.js, Vercel, Gemini/Grok/OpenRouter, Upstash, Turso, LiveKit).

---

## 1. Core agentic features (from the build plan)

- **Multi-provider routing** — agents run on Gemini, Grok, or OpenRouter behind one interface, with automatic fallback on error/rate-limit.
- **Task queue** — tasks enqueued via Upstash, picked up by workers, with retry on failure.
- **Sandboxed execution** — each agent run operates in a scoped workspace (file read/write, shell, git) rather than touching a real repo directly.
- **Live run streaming** — tool calls, diffs, and terminal output stream in real time over LiveKit to the dashboard.
- **Task dependencies** — sequential/parallel ordering so Task B can wait on Task A.
- **Cost/token tracking** — per Run, rolled up per Task and per Workspace.
- **Agent configuration** — per-agent system prompt, model choice, and allowed toolset.

## 2. Core platform features

- **Task board** — kanban view (queued/running/done/failed) per workspace.
- **Multi-workspace support** — one orchestrator instance managing several repos/projects.
- **Run history & logs** — durable summary of every past run, searchable.
- **Auth** — single-user to start, pluggable multi-tenant auth later.
- **Deploy pipeline** — Vercel-hosted, env-secret managed.

---

## 3. JARVIS-inspired features (practical)

JARVIS's defining traits are voice interaction, proactive help, and deep context — all buildable here since LiveKit already gives you the real-time transport.

| Feature | What it looks like | Feasibility |
|---|---|---|
| **Voice control** | Speak a task instead of typing it; LiveKit carries audio, an STT step feeds the provider router. | High — LiveKit is already in the stack for this. |
| **Spoken status briefings** | "Here's what shipped overnight" — a daily/weekly TTS summary of completed runs. | High — combine Turso run history + TTS. |
| **Proactive suggestions** | Orchestrator notices a stale PR, a flaky test, or a recurring error pattern and offers to spin up a task for it — without being asked. | Medium — needs a background watcher agent, but no new stack pieces. |
| **Persistent contextual memory** | Agents remember prior decisions on a workspace ("we chose Drizzle over Prisma here, don't relitigate it") across sessions. | High — a `memory` table in Turso, retrieved into the agent's context. |
| **Personality/tone presets** | Pick how an agent talks in logs/briefings — terse, verbose, formal. | High — just a system-prompt variable. |
| **HUD-style mission control** | A live dashboard view showing all active agents at once, like a status wall, rather than one run at a time. | High — pure frontend work on top of existing LiveKit streams. |
| **Cross-device notifications** | Push a summary to Slack/Discord/email when a run finishes or needs approval. | High — standard webhook integrations. |

## 4. Ultron-inspired features (practical, with guardrails)

Ultron's interesting traits — self-modification, distributed instances, autonomous scale — are worth borrowing *only* with explicit human control points, since the character is literally the cautionary tale for why those need limits.

| Feature | What it looks like | Guardrail it needs |
|---|---|---|
| **Self-reflective agents** | After a failed run, an agent writes a short retrospective and proposes a system-prompt tweak for next time. | The tweak is proposed, not auto-applied — a human or a review agent approves it. |
| **Agent swarm mode** | Spin up several agent instances in parallel to attempt the same hard task independently, then compare results. | Cap swarm size and total budget per invocation. |
| **Distributed run instances** | The same logical agent can have runs executing across multiple workers simultaneously, not just one at a time. | Just an execution-model choice — no new risk if runs stay sandboxed. |
| **Self-maintaining knowledge graph** | Agents keep a live dependency/architecture map of the codebase updated as they work, instead of a human maintaining docs. | Read-mostly; changes to the graph are logged like any other run. |
| **Autonomy tiers** | Agents escalate from read-only → propose-a-diff → auto-merge-on-green-tests as they earn trust on a given workspace. | Escalation requires explicit human sign-off, never self-granted. |

## 5. Gaps worth adding to the build plan

Things neither the JARVIS/Ultron brainstorm nor the original plan explicitly covers:

- **Kill switch** — one action to pause a single agent, a workspace, or the entire orchestrator immediately.
- **Approval gates** — certain actions (merging to main, deleting files, spending above a token budget) require explicit human approval before an agent proceeds.
- **Audit log** — an immutable record of every action any agent took, separate from the regular run log, for accountability.
- **Agent versioning & rollback** — if a prompt change (self-proposed or manual) makes an agent worse, roll back to the prior version.
- **Dry-run / simulation mode** — preview what a task would change without executing it for real.
- **Agent-to-agent handoff protocol** — a defined way for one agent to delegate a subtask to another (specialist) agent rather than doing everything itself.
- **Templates/presets library** — reusable agent configs for common task types (bug fix, dependency bump, test-writing) so users aren't starting from a blank prompt each time.
- **Budget caps** — hard ceiling on tokens/cost per task, per workspace, per day.
- **Test coverage for agent output** — a way to verify an agent's change didn't break the build before it's considered "done," not just that the agent claims success.

---

## Suggested priority order

1. Kill switch + approval gates + audit log (safety before autonomy — do this alongside Phase 3, not after).
2. Persistent memory + templates library (compounding value, low complexity).
3. Voice control + spoken briefings (leverages LiveKit you're already integrating).
4. Proactive suggestions + swarm mode (highest payoff, but depends on everything above being solid first).
