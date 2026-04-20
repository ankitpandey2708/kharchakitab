# Eval Setup — Kharchakitab

**Date:** 2026-04-20
**Scope:** All AI-powered flows
**Operational docs:** [`evals/README.md`](../evals/README.md) (how to run, dataset format, scorers)

**Sequencing principle:** finish one flow end-to-end before starting the next. Don't half-build evals across multiple surfaces in parallel — it spreads attention thin and nothing ships to a usable state.

---

## Flow order

1. **Text agent** (`/api/agent`) — in progress, L1 done
2. **Voice loop** (STT → VAD → agent → TTS) — not started
3. **Receipt parser** (`/api/receipt`) — not started, gated on labeled data

---

## The 5-layer eval model (2026 standard)

Every eval we build belongs to exactly one layer. Used as a checklist per flow.

| # | Layer | What it is | Runs when | Primary owner |
|---|---|---|---|---|
| 1 | **Deterministic scorers** | Regex, set-ops, schema checks, pure-function I/O | Every PR, <1s | Eng |
| 2 | **LLM-as-judge** | Pairwise/rubric grading by a stronger model | Pre-release | **PM** writes rubric, eng wires runner |
| 3 | **Human review** | Labeled gold set, manual spot-checks, vibe checks | Weekly / on drift | **PM** |
| 4 | **Production trace sampling** | Run L1–L2 on live traffic; the raw material for error analysis | Continuous | **PM** triages, eng wires sampling |
| 5 | **Operational SLOs** | Latency, cost, token budgets | Continuous | Eng |

**PM workflow across layers.** The 2026 expectation (Husain, Shankar et al.) is that PMs own the *error-analysis loop*: sample ~100 production traces from L4, cluster failures into categories, turn any category >5% into a new L1 scorer or L2 rubric item. L1 and L5 are eng-owned; everything in between is PM-led.

> **Vocabulary note.** Some teams call L1 "unit tests" and reserve "evals" for L2/L3. The major 2026 frameworks (Vercel AI SDK, Braintrust, Inspect AI, Langfuse, LangSmith) all bundle deterministic scorers under "evals" — that inclusive definition is what this doc uses.

---

## Flow 1 — Text agent (`/api/agent`)

**Exit criteria:** L1 + L2 + L4 + L5 green. L3 optional, on-demand.

| Layer | Status | Notes |
|---|---|---|
| L1 Deterministic | ✅ done | 5 scorers, 10 seed cases (see below) |
| L2 LLM-judge | ❌ | Tone, Hinglish naturalness, helpfulness — pairwise judge |
| L3 Human | ❌ | Multi-turn gold set, adversarial set — build only if L2 proves insufficient |
| L4 Trace sampling | ❌ | PostHog `$ai_generation` events → run L1 scorers on 1–5% of live traffic |
| L5 SLOs | ❌ | Per-case token budget, p95 latency budget |

### What's built (L1)

Located in `evals/`. Prod and evals share `SYSTEM_PROMPT` via `src/lib/agent/config.ts` so they can't drift. Runner: `npm run evals`.

The scorer table below doubles as the **failure taxonomy** for this flow — each row is a category of mistake we explicitly catch. New failure modes found during PM error analysis (L4) should appear here as new rows.

| Scorer | Failure category it catches | Checks |
|---|---|---|
| `tool-selection` | Wrong or missing tool call | Exact set of `expectedTools` was called |
| `no-hallucinated-numbers` | Fabricated ₹ amount | Every ₹/Rs/INR amount in reply appears in tool I/O |
| `write-phrasing` | Claims write succeeded before confirm | `set_budget` reply asks confirm, doesn't claim done |
| `pending-action` | Wrong action or amount emitted to UI | Emitted action matches expected tool + amount |
| `reply-regex` | Misses required refusal phrasing | Reply matches `replyMustMatch` (refusal-style cases) |

**Not yet covered** (open for error-analysis to add): tone/Hinglish naturalness (L2), multi-turn coherence, adversarial/injection resistance.

### What's left in Flow 1

1. **CI gate** — GitHub Action runs `npm run evals`, blocks merge on failure. (Plumbing, but owned by this flow since it has the first evals to gate on.)
2. **L2 tone judge** — pairwise judge using Gemini 2.5 Pro. Rubric lives at `evals/judges/tone.md` (PM-owned, versioned in git) and covers tone + Hinglish naturalness + helpfulness.
3. **L5 budgets** — assert each case stays under token and latency thresholds in the runner.
4. **L4 trace sampling + error-analysis loop** — PostHog `$ai_generation` sample → async L1 scorer run → weekly PM review session: read ~100 sampled traces, cluster failures, promote any >5% category into a new L1 scorer or L2 rubric item.
5. **Dataset pipeline** — PostHog traces → dedupe → label → append `evals/datasets/agent.jsonl`. Turns real user queries into cases. Feeds #4.
6. **Vibe-check mode** — `npm run evals -- --sample N` dumps N random outputs for a human skim, independent of pass/fail. Cheap tool for PM spot reads before releases.
7. **L3 (optional)** — multi-turn + adversarial gold set, only if L2 misses something important.

---

## Flow 2 — Voice loop

**Exit criteria:** L1 on deterministic sub-pieces + L5 telemetry dashboard green. L2/L3 only if specific gaps surface.

| Layer | Status | Notes |
|---|---|---|
| L1 Deterministic | ❌ | `parseTranscript` (pure fn) — highest-value starting point. Clause segmentation once P1 #5 from `mic_behaviour.md` lands. |
| L2 LLM-judge | ❌ | Transcript-intent judge — only needed if `parseTranscript` can't be made deterministic enough |
| L3 Human | ❌ (deprioritized) | Recorded Hinglish audio corpus with gold transcripts — drifts from real mic conditions; prefer L4 |
| L4 Trace sampling | ❌ | Not applicable — voice is latency-evaluated, not output-evaluated |
| L5 SLOs | ❌ | STT WER, VAD timing, barge-in <200ms, E2E <800ms — builds on existing PostHog events (`voice_query_ttft`, `voice_query_barge_in`) |

### Plan for Flow 2

1. **L1 `parseTranscript` evals** — mirror agent eval pattern: JSONL of `{utterance, expected}` cases, pure-function scorer.
2. **L5 telemetry dashboard** — PostHog panels for TTFT, barge-in latency, E2E latency. Use existing events, add TTS-time-to-first-byte event.
3. **L1 clause segmentation** — when that code lands (currently pending per voice roadmap).
4. Reassess whether L2/L3 are needed based on production pain.

---

## Flow 3 — Receipt parser (`/api/receipt`)

**Exit criteria:** L1 + L2 green on a labeled set of ~30 receipts. **Gated on labeling effort.**

| Layer | Status | Notes |
|---|---|---|
| L1 Deterministic | ❌ | Zod schema validation + field-level accuracy (merchant, total, date, line items) on labeled corpus |
| L2 LLM-judge | ❌ | Extraction-quality judge for line-item edge cases |
| L3 Human | ❌ | The labeled corpus itself is the L3 artifact |
| L4 Trace sampling | ❌ | Sample real extractions, schema-validate async |
| L5 SLOs | ❌ | Per-image cost budget, p95 latency |

### Plan for Flow 3

1. Label ~30 diverse receipts (manual, one-time effort).
2. L1 schema + field-match scorer.
3. L2 judge only for fields L1 can't score cleanly (e.g. fuzzy line-item matching).
4. L4 + L5 once L1 is stable.

---

## Cross-cutting plumbing

Not tied to a flow, but unlocked progressively as flows land.

| Item | Status | Owner | Unlocked by |
|---|---|---|---|
| CI gate (GitHub Action on `npm run evals`) | ❌ | Eng | Flow 1 |
| Regression history (per-case pass/fail over time) | ❌ | Eng | Flow 1 |
| Dataset pipeline (PostHog traces → dedupe → label → JSONL) | ❌ | PM curates, eng scripts | Flow 1 (reused by Flow 3 trace sampling) |
| Judge rubric files (`evals/judges/*.md`, versioned in git) | ❌ | **PM** | Flow 1 L2 work |
| Failure taxonomy (per-flow list of mistake categories) | ⚠️ implicit in scorer tables | PM | Flow 1 (make explicit), grows per flow |
| Error-analysis cadence (weekly trace review) | ❌ | **PM** | Flow 1 L4 |
| Vibe-check mode in runner (`--sample N`) | ❌ | Eng | Flow 1 |

---

## Priority order

Three batches, done strictly in order. Each item is tagged with the eval layer it fills (L1–L5) and the owner. Don't skip ahead — Batch 1 builds plumbing (CI, judge runner, dataset pipeline, trace sampling, vibe-check) that Batches 2 and 3 reuse.

### Batch 1 — Text agent (current focus)

L1 scorers already exist. This batch makes them useful day-to-day and fills the missing layers.

| # | Item | Layer | Owner |
|---|---|---|---|
| 1 | Wire `npm run evals` into CI so failing evals block PR merge | L1 | Eng |
| 2 | Add token + latency budgets per case in the runner | L5 | Eng |
| 3 | Pairwise "taste" judge (tone, Hinglish, helpfulness); rubric at `evals/judges/tone.md` | L2 | PM writes rubric, Eng wires |
| 4 | Dataset pipeline: PostHog traces → dedupe → append to `agent.jsonl` | plumbing | PM curates, Eng scripts |
| 5 | Sample 1–5% of production, run scorers async, 30 min/week PM error-analysis review | L4 | PM |
| 6 | `npm run evals -- --sample N` for human spot-reads (no pass/fail) | L3-lite | Eng |

**Stop here until all six are green.** Don't start voice or receipts.

### Batch 2 — Voice loop

Reuses Batch 1 plumbing. Voice output is judged on *latency*, not text — so L4 becomes a dashboard review and L2/L3 are deferred.

| # | Item | Layer | Owner |
|---|---|---|---|
| 1 | `parseTranscript` scorer — JSONL of `{utterance, expected}` cases | L1 | Eng |
| 2 | Clause-segmentation scorer (when that feature lands) | L1 | Eng |
| 3 | PostHog dashboard for TTFT / barge-in / E2E latency | L5 | Eng |
| 4 | Weekly PM review of the latency dashboard; >10% p95 regression → ticket | L4-lite | PM |
| — | L2 judge, L3 audio corpus | deferred — add only if L1+L5 miss something | — |

### Batch 3 — Receipt parser

Gated on labeling. Don't start until Batch 1 is green.

| # | Item | Layer | Owner |
|---|---|---|---|
| 1 | Label ~30 diverse receipts (also serves as the L3 gold set) | L3 | PM |
| 2 | Zod schema + field-match scorer (merchant / total / date) | L1 | Eng |
| 3 | Line-item judge for fuzzy matches; rubric at `evals/judges/receipt-lines.md` | L2 | PM + Eng |
| 4 | Sample real uploads, schema-validate async, weekly error-analysis review | L4 | PM |
| 5 | Per-image cost + latency budgets | L5 | Eng |

### Why this order

- **Batch 1 first** — highest daily ROI (text agent is most-used) and it builds the plumbing the other two reuse.
- **Batch 2 next** — `parseTranscript` is a free win (pure function), and the latency dashboard runs on PostHog events you already emit.
- **Batch 3 last** — the labeling step is grunt work that's easy to procrastinate on; don't let it block the others.

---

## Decisions locked in

Choices we've already made so they don't get re-debated every time someone opens this file.

### 1. No extra vendor — we roll our own on top of AI SDK + PostHog

Paid eval platforms (Braintrust, Langfuse) give fancy dashboards but add another login, another bill, another thing to configure.

The AI SDK itself doesn't ship a dedicated evals framework — no `ai/evals` module. What it does give us is **structured outputs** from `generateText`: `result.steps[].toolCalls`, `toolResults`, and `response.messages`. That's all our scorers need to parse, so evals are cheap to *build* on top of the SDK even though the SDK doesn't *run* them. PostHog covers production tracing and dashboards. Together that's enough — no third service needed.

### 2. LLM judge uses A/B comparisons, not 1–5 scores

When a bigger model grades the agent's replies, we ask *"which of these two is better?"* — not *"rate this 1 to 5."* Pointwise numeric scores suffer from position bias, verbosity bias, and poor calibration; the same reply gets different scores run-to-run. Pairwise picks are substantially more stable and agree with humans more often.

Canonical source: **Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena* (2023)** — https://arxiv.org/abs/2306.05685 (see §4 on judge biases, Table 2 on pairwise vs pointwise human agreement). Practitioner follow-ups: Hamel Husain (https://hamel.dev/blog/posts/evals/), Eugene Yan (https://eugeneyan.com/writing/llm-evaluators/).

**Rubric ownership.** Each judge's rubric lives in its own file under `evals/judges/` (e.g. `evals/judges/tone.md`) and is **PM-owned**. Rubric changes are code-reviewed like any other file. Engineers wire the runner; PMs write what "good" means.

### 3. One flow at a time — plumbing rides along

We don't build three half-done eval suites in parallel. Text agent gets finished, then voice, then receipts. CI gate, judge config, dataset pipeline — these aren't a separate roadmap; they get built inside whichever flow needs them first (Batch 1 in our case).

### 4. Voice skips L3 (human-labeled audio)

Of the five layers, **L3 — labeled gold audio corpus** is the one we're skipping for voice. Normally you'd record Hinglish clips and write down correct transcripts to test STT against. We're not, because recorded clips drift from real mic conditions fast. We'll lean on L5 PostHog telemetry (existing `voice_query_ttft`, `voice_query_barge_in` events) to watch quality in production instead. L1, L2, L4, L5 remain in scope for voice.

### 5. Receipt evals are gated on labeling (and only receipts)

Receipts are the only flow where **we can't start L1 without human labels first**. Why this is receipt-specific:

| Flow | Input | Ground truth source |
|---|---|---|
| Text agent | text message | **synthesized** — rules like "am I on track" → `[get_budget, get_summary]`. Wrote 10 cases in 5 minutes. |
| Voice | audio clip | `parseTranscript` grounds truth from text (no labels). Audio→text itself uses L5 telemetry (no labels). |
| Receipt | image | **only humans** — you can't synthesize a realistic receipt photo, and even with photos someone has to read each one and write down merchant/total/date/items. |

So until ~30 receipts are manually labeled, no receipt eval work starts. Called out here so nobody begins prematurely.
