# Agent Evals — Quickref

Strategy, layer model, priority order, and decisions: [`docs/evals.md`](../docs/evals.md).

## Run

```bash
npm run evals                                      # text agent (default)
npm run evals -- evals/datasets/voice.jsonl        # voice
npm run evals -- evals/datasets/receipts.jsonl     # receipts
npm run evals -- evals/datasets/agent.jsonl id     # one case by id
EVAL_VERBOSE=1 npm run evals                       # dump replies + tool calls
```

Requires `GEMINI_API_KEY` and `GEMINI_MODEL` in `.env`. Exit code 0 iff every case passes every scorer.

## Scorers (L1 — text agent)

| Scorer | Checks |
|---|---|
| `tool-selection` | Exact set of `expectedTools` were called (no missing, no extras) |
| `no-hallucinated-numbers` | Every ₹/Rs/INR amount in reply appears in tool-call inputs or results |
| `write-phrasing` | If `set_budget` called: reply asks confirm, does NOT claim budget was set |
| `pending-action` | Emitted `pendingAction` matches `expectedPendingAction` (tool + amount) |
| `reply-regex` | Reply matches `replyMustMatch` — used for refusal/out-of-window cases |

## Adding a case

1. Append a JSONL line to the relevant `datasets/*.jsonl`.
2. Run `npm run evals -- evals/datasets/agent.jsonl your-new-id` to verify.
3. If it passes, commit. If the model is wrong, fix the prompt or tool — not the expectation.

## Dataset field reference

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
