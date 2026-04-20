# Agent Evals

Deterministic evals for the `/api/agent` financial assistant.

## Run

```bash
npm run evals                                     # all cases
npm run evals -- evals/datasets/agent.jsonl id    # one case by id
EVAL_VERBOSE=1 npm run evals                      # dump replies + tool calls
```

Requires `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env` (same vars the app uses).
Exit code is 0 iff every case passes every scorer.

## Scorers

| name | what it checks |
|---|---|
| `tool-selection` | exact set of `expectedTools` were called (no missing, no extras) |
| `no-hallucinated-numbers` | every `₹N` / `Rs N` / `INR N` in the reply appears in tool-call inputs or results |
| `write-phrasing` | if `set_budget` was called, reply asks for confirmation and does NOT claim the budget was already set |
| `pending-action` | emitted `pendingAction` matches `expectedPendingAction` (tool + amount) |
| `reply-regex` | reply matches `replyMustMatch` (case-insensitive) — used for refusal/out-of-window cases |

All scorers are deterministic (regex / set-ops). No LLM judge in this tier.

## Dataset format (`datasets/agent.jsonl`)

One JSON object per line:

```json
{
  "id": "unique-slug",
  "tags": ["tool-selection"],
  "snapshot": {
    "monthlyBudget": 20000,
    "expenses": [{"daysAgo": 1, "amount": 450, "item": "Zomato", "category": "food"}],
    "recurring": [{"item":"Netflix","amount":649,"category":"entertainment","frequency":"monthly","dueInDays":3}]
  },
  "messages": [{"role": "user", "content": "am I on track?"}],
  "expectedTools": ["get_budget", "get_summary"],
  "expectedPendingAction": {"tool":"set_budget","monthly_limit_inr":25000},
  "replyMustMatch": "outside|not available"
}
```

Timestamps in fixtures are **relative to now** (`daysAgo`, `dueInDays`) so cases stay current as the calendar advances — no frozen-time hacks needed.

## Adding cases

1. Append a JSONL line to `datasets/agent.jsonl`.
2. Run `npm run evals -- evals/datasets/agent.jsonl your-new-id` to verify.
3. If it passes, commit. If the model is wrong, fix the prompt or tool — not the expectation.

## Next tiers (not yet built)

- **LLM-judge** for tone/helpfulness (pairwise, Gemini 2.5 Pro as judge).
- **PostHog trace sampling** to run these scorers on 1–5% of production turns.
