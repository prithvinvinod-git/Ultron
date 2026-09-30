# ULTRON ARC1 — Task Plan

Branch: `ultron-arc1` (forked from green `main` @ `f3670a8`)
Spec: `app_arc.md`
Status log: `todo.md`

## Non-negotiable rules

1. **Never break the current app.** `app_arc.md` line 6 requires building the new architecture
   *on top of* the existing flow, not replacing it. `/`, `/settings`, `/memory`, `/system`,
   `/tools`, chat streaming, and voice must keep working at every commit on this branch.
2. **Additive seams only.** New modules go *behind* existing interfaces — `DataStore`, `Provider`,
   `ToolSpec`. Route contracts and component props stay backward compatible.
3. **Behaviour-preserving defaults.** New layers ship configured to match today's behaviour. The
   UI should not visibly change until a step is explicitly opted into.
4. **Ship-checkpointed.** Every step ends green: `typecheck`, `lint`, `build`, `test`, plus a live
   probe of `/api/health`, one real chat turn, and voice against the deployment.
5. **Verify runtime, not compilation.** `app_arc.md` §19 — never claim a feature works because it builds.

## Decisions taken

| Question | Decision |
|---|---|
| Auth | **Firebase Auth** (Firestore and `firebase-admin` already in the stack) |
| Branch scope | Foundation first (Steps 0–5), then agents. Do not attempt all 15 spec phases on one branch |
| PostgreSQL + pgvector + Redis | **Later.** Do not add a third store before embeddings land. `DataStore` is the seam |
| Event transport (testing) | **Firestore realtime listeners** — see below |
| TTS | **Cartesia Sonic 3.5**, mood-varying, Edge TTS as fallback (see `todo.md`) |
| Browsers/Windows automation | Cloud for now; local automation deferred until a host exists |

### Why Firestore realtime listeners for events

`app_arc.md` §4/§16 wants WebSocket push and forbids aggressive polling. Vercel serverless
**cannot hold its own WebSocket**, but the Firebase JS SDK maintains a long-lived socket to
Google's infrastructure, so `onSnapshot()` delivers push updates from behind Vercel at zero
infrastructure cost during testing.

- Cost: free-tier Firestore read/write quota. **Known risk** — quota exhaustion has already
  happened once, so event writes must be budgeted and capped.
- The client needs the `firebase` JS SDK (only `firebase-admin` is installed today).
- This sits behind a swappable `EventBus` interface, so a real WS server later touches one module.
- If we later need a true always-on host (real WS, local models, Windows automation), that is
  Fly.io / Railway / a VM — deferred, not needed for testing.

---

## Gap analysis (current `main`)

**Already good — do not rebuild:**
- `db/types.ts:77` `DataStore` interface, two backends, `tryStore` degradation → satisfies §17
  "everything should be replaceable".
- 4 model providers behind `ai/providers/types.ts` → provider does not leak (§17).
- `ai/tools/registry.ts:216` vs `:221` — model-facing specs and public metadata are separate.
- `lib/store-error.ts`, `lib/activity.ts` (echo detection, stop phrases).

**Gaps, by risk:**

| # | Gap | Evidence | Spec |
|---|---|---|---|
| 1 | No permission enforcement | `registry.ts:230` calls `tool.execute()` directly — no gate, no validation, no logging. `requiresApproval` is decorative; `app/api/tools/route.ts:25` admits *"Not currently gating tool execution."* | §5, §10 |
| 2 | Client owns model choice | `app/api/chat/route.ts:19` takes `provider`/`model` from the body | §13 |
| 3 | Client owns history | `route.ts:30` builds history from `body.messages` | §3 |
| 4 | Single orchestrator | `ai/agent.ts:363` one `runAgent` generator: persona + routing + tool loop + streaming | §11, §12 |
| 5 | No event bus / WebSocket | SSE per-request only; zero WS refs | §4, §16 |
| 6 | No auth, PWA, or tests | no middleware, no manifest/SW, no test runner | Phase 1, §1, §19 |
| 7 | Component monoliths | `ai-model-select.tsx` 1269, `ai-agent-response.tsx` 1240, `ai-prompt-box.tsx` 951; chat/voice live in `app/components/`, not `components/` | §2, §17 |

Also flagged for review: `registry.ts:250` uses `new Function` for `calculate` (charset-stripped,
but worth an explicit safety decision).

---

## Step 0 — Test safety net ✅ *no behaviour change*

`app_arc.md` §19 requires tests per subsystem. There are currently **zero**. This step makes every
later refactor safe to attempt.

- [x] Add `vitest` + config + `test` / `test:watch` npm scripts
- [x] `ai/providers` model resolution and catalogue sanity (no hardcoded model names leaking)
- [x] `ai/tools` registry: unique names, every tool has a description + input schema, public
      metadata never leaks `execute`
- [x] `ai/tools` `calculate` argument sanitisation and error paths
- [x] `lib/activity` `looksLikeEcho` / `isStopPhrase` behaviour
- [x] `db` backend selection: env → backend mapping, and `tryStore` fallback on throw
- [x] `lib/settings` defaults and merge semantics

**Result: 78 tests across 5 files. `typecheck`, `lint`, `build` all green; route table
identical to `main`.** Vitest 4 (vitest 5 requires `@types/node@26`; this project is on 20.x).
`server-only` is aliased to a stub in `vitest.config.mts` — it throws outside an RSC graph.

### Defects found by the safety net (fix in Step 1)

- [ ] **`safeEvaluate` leaks raw engine errors** — `ai/tools/registry.ts:249`. It guards empty
      input and non-finite *results*, but never checks the stripped source is *parseable*.
      `process.exit(1)` → `.(1)` → `SyntaxError`; `1)` → `SyntaxError`; `1; while(true){}` →
      `1()` → `TypeError: 1 is not a function`. These escape the tool layer and surface as a
      `tool_error` event, so engine text like `Unexpected token '.'` can reach the user and the
      voice. **Security is intact** — nothing executes; the payload cannot escape the charset
      strip. Add a parse check and return the existing "Uncomputable expression" error.
      Pinned by `test/tools-registry.test.ts` ("KNOWN DEFECT"); flip that assertion when fixed.
- [ ] **`longWaitLine(-1)` returns `undefined`** — `lib/activity.ts:71`. `-1 % 3 === -1` indexes
      past the array. Unreachable (the caller counts up from 0) but would render `undefined`.

## Step 1 — Permission + tool execution pipeline

Biggest risk reduction, no UI change. Closes gap #1.

- [ ] Extend tool definition with `permissionLevel` (0–5), `outputSchema`, `validate()`
- [ ] `ai/permissions/` — PermissionManager: level 0–5, policy table, approval gate
- [ ] Reroute `executeTool` through: LLM → Agent → Tool Router → Permission Manager → Tool →
      Executor → Verification → Result
- [ ] `ai/tools/logging.ts` — log timestamp, user, agent, tool, arguments, permission level,
      result, success/failure, verification result
- [ ] **Every existing tool inherits a level that preserves today's behaviour** (Rule 3), so chat
      is untouched. Only newly added browser/Windows tools actually gate.
- [ ] Tool execution log persistence behind the `DataStore` seam
- [ ] Tests: level matrix, denied-when-required, validation failure, log written on success+failure

## Step 2 — ULTRON Core + Model Router

Closes gaps #2, #3, #4. Spec §3/Phase 3, §11, §12, §13.

- [ ] `ai/core/conversation.ts` — ConversationManager; session becomes the source of truth,
      client `body.messages` becomes a fallback
- [ ] `ai/core/context.ts` — ContextBuilder with a real token budget
- [ ] `ai/core/planner.ts` — UNDERSTAND → PLAN
- [ ] `ai/core/tasks.ts` — TaskRegistry + lifecycle REQUEST → … → COMPLETE, and the
      VERIFY → FAILURE → REPLAN loop
- [ ] `ai/router/` — ModelRouter owning the decision. The client's `provider`/`model` becomes a
      *hint* the router may override; Settings keeps working unchanged (Rule 3)
- [ ] Routing factors: task type, privacy, latency, cost, availability, context size
- [ ] `runAgent` stays as a thin façade so `app/api/chat/route.ts` barely changes
- [ ] Never report success before verification (§12)
- [ ] Tests: router honours hint when valid, overrides when unavailable, core assembles context
      within budget, task lifecycle transitions

## Step 3 — EventBus + transport

Closes gap #5. Spec §4, §16.

- [ ] `lib/events/` — typed event bus, in-process, covering the §16 event list
- [ ] Firestore realtime transport behind the `EventBus` interface (swappable to real WS)
- [ ] Client `firebase` JS SDK + `onSnapshot` subscriptions
- [ ] **Quota discipline** — capped writes, single `system_events` collection, retention policy
- [ ] Emit `TASK_*`, `TOOL_*`, `AGENT_*`, `SYSTEM_*` events from Steps 1–2
- [ ] No polling (§4)

## Step 4 — Route surfaces + shell

Closes part of gap #7. Spec §2, §3.

- [ ] Add `/chat`, `/tasks`, `/agents`, `/projects`, `/models`, `/devices`, `/logs`, `/voice`
- [ ] Keep `/`, `/settings`, `/memory`, `/system`, `/tools` working unchanged
- [ ] Nav shell (nav currently lives only in `app/components/sidebar.tsx`, not in `layout.tsx`)
- [ ] ULTRON dark visual language: near-black, blue/violet/cyan, glass panels, subtle borders,
      minimal futuristic effects
- [ ] Responsive: phone, tablet, laptop, desktop
- [ ] Decompose the 1269/1240/951-line components; move `app/components/*` → `components/*` per §2
- [ ] Tabs/subnav per surface, SSR-first, client islands for orb animations

## Step 5 — Auth (Firebase Auth) + PWA

Spec Phase 1, §1.

- [ ] Firebase Auth client wiring; `middleware.ts` for session protection
- [ ] **Feature-flagged and default-off first**, so `main` behaviour is untouched
- [ ] Login UI, sign-out, auth state in Settings
- [ ] PWA: manifest + service worker, installable, offline shell

## Step 6 — Voice completion

The plan already in `todo.md`. Spec §14.

- [ ] Cartesia Sonic 3.5 behind `POST /api/voice/tts`, engine chosen by env, client untouched
- [ ] Provider abstraction; keep `msedge-tts` as fallback until verified by ear
- [ ] Per-sentence speaking as the stream arrives (`onDelta` + sentence splitter)
- [ ] Always-on AEC + VAD barge-in, independent of STT backend
- [ ] Streamed `mood` field → one `<emotion>` per sentence
- [ ] AbortController so barge-in kills in-flight synthesis
- [ ] Wake word — deferred until local hosting is decided

## Step 7+ — Agents, one at a time

Spec §11. **Only after Step 1's permission gate exists.** Spec §20: make the agent runtime stable
first, then one agent at a time.

- [ ] General Agent
- [ ] Coding Agent
- [ ] Browser Agent + Playwright (`server/tools/browser/`, high-level abstractions only — §6)
- [ ] Windows Agent + pywinauto / UI Automation (§7, local only)
- [ ] System Agent
- [ ] Automation Agent
- [ ] Vision Agent (§9 — screenshot → detection → action → screenshot → verification)

## Deferred — deliberately not scheduled

- [ ] PostgreSQL + pgvector + Redis — after embeddings; **do not add a third store yet**
- [ ] Semantic memory / embeddings (§15)
- [ ] Event bus + scheduler at scale (Phase 13)
- [ ] Autonomous tasks (Phase 12)
- [ ] ESP32 integration (Phase 15)
- [ ] Local models / Ollama (Phase 4) — needs a host
- [ ] Local STT (faster-whisper) / local TTS (Piper) — needs a host
- [ ] Real WebSocket server — needs a host
