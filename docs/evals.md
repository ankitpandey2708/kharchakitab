# Eval Setup — Kharchakitab

## Flow order

1. **Text agent** (`/api/agent`) — ✅ complete (exit criteria met: L1+L2+L4+L5 green)
2. **Voice loop** (STT → VAD → agent → TTS) — current focus (Batch 2)
3. **Receipt parser** (`/api/receipt`) — not started, gated on labeled data

---

## Running evals

Requires `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`.

```bash
npm run evals                        # L1+L5 on seed cases (text agent)
npm run evals:prod                   # L4 only: scores live PostHog traces, no model inference
npm run evals -- <dataset> <id>      # single case, e.g. evals/datasets/agent.jsonl out-of-window
EVAL_VERBOSE=1 npm run evals         # dump replies + tool calls (L3 manual review)
npm run evals:judge                  # L2 pairwise judge
```

Exit code 0 iff every case passes every scorer.

### Adding a case

1. Append a JSONL line to the relevant `evals/datasets/*.jsonl`.
2. Run `npm run evals -- evals/datasets/agent.jsonl your-new-id` to verify.
3. If it passes, commit. If the model is wrong, fix the prompt or tool — not the expectation.

### Dataset field reference

```json
{
  "id": "unique-slug",
  "tags": ["tool-selection"],
  "snapshot": {
    "monthlyBudget": 20000,
    "expenses": [{"daysAgo": 1, "amount": 450, "item": "Zomato", "category": "food"}],
    "recurring": [{"item": "Netflix", "amount": 649, "category": "entertainment", "frequency": "monthly", "dueInDays": 3}]
  },
  "messages": [{"role": "user", "content": "am I on track?"}],
  "expectedTools": ["get_budget", "get_summary"],
  "expectedPendingAction": {"tool": "set_budget", "monthly_limit_inr": 25000},
  "replyMustMatch": "outside|not available"
}
```

`daysAgo` / `dueInDays` are relative to now — no frozen-time hacks needed. Only include the `expected*` fields relevant to your case; omit the rest.

---

## The eval model (2026 standard)

4 distinct layers. L4 is not new scoring logic — it's L1+L5 re-run on live traffic instead of seed cases.

| # | Layer | What it is | Runs when | Primary owner |
|---|---|---|---|---|
| 1 | **Deterministic scorers** | Regex, set-ops, schema checks, pure-function I/O | Every PR (`npm run evals`) | Eng |
| 2 | **LLM-as-judge** | Pairwise/rubric grading by a stronger model | Pre-release (`npm run evals:judge`) | **PM** writes rubric, eng wires runner |
| 3 | **Human review** | Manual spot-checks, vibe checks | Weekly / on drift (`EVAL_VERBOSE=1 npm run evals`) | **PM** |
| 4 | **Production trace sampling** | L1 + L5 scorers re-run on live traffic — same scorers, real user inputs | Weekly cron (`npm run evals -- --trace`) | **PM** triages, eng wires sampling |
| 5 | **Operational SLOs** | Latency, cost, token budgets — asserted inside the L1 runner and trace runner | Every PR + weekly cron | Eng |

**PM workflow across layers.** The 2026 expectation ([Hamel Husain](https://hamel.dev/blog/posts/evals/), [Shreya Shankar](https://www.sh-reya.com/blog/ai-engineering-gap/)) is that PMs own the *error-analysis loop*: seed evals run in CI on every PR; trace sampling runs async on a cron or weekly; PM reviews trace failures, clusters them, and turns any category >5% into a new L1 scorer or L2 rubric item. L1 and L5 are eng-owned; everything in between is PM-led.

> **Vocabulary note.** Some teams call L1 "unit tests" and reserve "evals" for L2/L3. The major 2026 frameworks (Vercel AI SDK, Braintrust, Inspect AI, Langfuse, LangSmith) all bundle deterministic scorers under "evals" — that inclusive definition is what this doc uses.

---

## Flow 1 — Text agent (`/api/agent`) ✅ Complete

**Exit criteria:** L1 + L2 + L4 + L5 green. L3 optional, on-demand. **All met.**

| Layer | Status | Notes |
|---|---|---|
| L1 Deterministic | ✅ done | 5 scorers, 10 seed cases, 10/10 passing on gemma-4-31b-it |
| L2 LLM-judge | ✅ done | Pairwise judge via OpenRouter (`openrouter/free`); rubric at `evals/judges/tone.md`; 2 win / 8 tie / 0 loss on 10 cases |
| L3 Human | ❌ | Multi-turn gold set, adversarial set — build only if L2 proves insufficient |
| L4 Trace sampling | ✅ done | L1 + L5 scorers re-run on live production traffic (same scorers, real user inputs). `agent_completion` events emitted from route → `npm run evals -- --trace` samples 5% of last 7 days |
| L5 SLOs | ✅ done | `budget` scorer asserts `maxTokens` + `maxLatencyMs` per case — limits set in JSONL when needed |

### What's built (L1)

Located in `evals/`. Prod and evals share `SYSTEM_PROMPT` via `src/lib/agent/config.ts` so they can't drift. Commands: `npm run evals` (L1 + L5 on seed cases), `npm run evals -- --trace` (L1 + L5 on live traffic = L4), `npm run evals:judge` (L2 pairwise judge). L3 is manual — read outputs via `EVAL_VERBOSE=1 npm run evals`.

**Dataset ownership.** Each flow has its own JSONL file (`evals/datasets/agent.jsonl`, `voice.jsonl`, `receipts.jsonl`). Eng creates the file and writes the first ~20 seed cases by hand. PM grows it over time: once L4 trace sampling is set up, real user queries flow from PostHog → PM reviews candidates → picks interesting/edge-case ones → appends to the JSONL. The file starts engineer-written and becomes PM-grown.

The scorer table below doubles as the **failure taxonomy** for this flow — each row is a category of mistake we explicitly catch. New failure modes found during PM error analysis (L4) should appear here as new rows.

| Scorer | Failure category it catches | Checks |
|---|---|---|
| `tool-selection` | Wrong or missing tool call | Exact set of `expectedTools` was called |
| `no-hallucinated-numbers` | Fabricated ₹ amount | Every ₹/Rs/INR amount in reply appears in tool I/O |
| `write-phrasing` | Claims write succeeded before confirm | `set_budget` reply asks confirm, doesn't claim done |
| `pending-action` | Wrong action or amount emitted to UI | Emitted action matches expected tool + amount |
| `reply-regex` | Misses required refusal phrasing | Reply matches `replyMustMatch` (refusal-style cases) |

**Not yet covered** (open for error-analysis to add): tone/Hinglish naturalness (L2), multi-turn coherence, adversarial/injection resistance.

### Remaining open items (cross-cutting, non-blocking)

Exit criteria are met. The items below are plumbing that improves ongoing quality but doesn't block moving to Batch 2.

1. ~~**CI gate**~~ — **skipped.** Would require maintaining secrets in both GitHub and Vercel. `npm run evals` is a manual pre-merge check instead.
2. ~~**L2 tone judge**~~ — ✅ done. Rubric at `evals/judges/tone.md`; results 2 win / 8 tie / 0 loss.
3. ~~**L5 budgets**~~ — ✅ done. `budget` scorer asserts `maxTokens` + `maxLatencyMs` per case.
4. ~~**L4 trace sampling**~~ — ✅ done. `npm run evals -- --trace` samples 5% of last 7 days.
5. **Dataset pipeline** — PostHog traces → dedupe → label → append `evals/datasets/agent.jsonl`. PM curates, eng scripts. Tracked in cross-cutting table.
6. **Vibe-check mode** — `npm run evals -- --sample N` dumps N random outputs for a human skim, independent of pass/fail. Tracked in cross-cutting table.
7. **L3 (optional, deprioritized)** — L2 results (0 loss) don't justify the effort yet. Revisit if L2 surfaces systematic gaps.

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
| Judge rubric files (`evals/judges/*.md`, versioned in git) | ✅ `tone.md` done | **PM** | Flow 1 L2 work |
| Failure taxonomy (per-flow list of mistake categories) | ⚠️ implicit in scorer tables | PM | Flow 1 (make explicit), grows per flow |
| Error-analysis cadence (weekly trace review) | ❌ | **PM** | Flow 1 L4 |
| Vibe-check mode in runner (`--sample N`) | ❌ | Eng | Flow 1 |

---

## Priority order

Three batches, done strictly in order. Each item is tagged with the eval layer it fills (L1–L5) and the owner. Don't skip ahead — Batch 1 builds plumbing (CI, judge runner, dataset pipeline, trace sampling, vibe-check) that Batches 2 and 3 reuse.

### Batch 1 — Text agent ✅ Complete

Exit criteria met. Items 4 and 6 continue in parallel with Batch 2.

| # | Item | Layer | Owner |
|---|---|---|---|
| ~~1~~ | ~~Wire `npm run evals` into CI~~ — skipped, dual secret maintenance cost too high. | — | — |
| ~~2~~ | ~~Add token + latency budgets per case in the runner~~ — ✅ done | L5 | Eng |
| ~~3~~ | ~~Pairwise "taste" judge; rubric at `evals/judges/tone.md`~~ — ✅ done | L2 | PM + Eng |
| 4 | Dataset pipeline: PostHog traces → dedupe → append to `agent.jsonl` | plumbing | PM curates, Eng scripts |
| ~~5~~ | ~~Sample 1–5% of production, run scorers async, weekly PM error-analysis review~~ — ✅ done | L4 | PM |
| 6 | `npm run evals -- --sample N` for human spot-reads (no pass/fail) | L3-lite | Eng |

**Batch 1 exit criteria met.** Items 4 and 6 are tracked in the cross-cutting table and can run in parallel with Batch 2. Start Batch 2 now.

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
