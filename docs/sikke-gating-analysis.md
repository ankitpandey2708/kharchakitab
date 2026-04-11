# Sikke & Feature Gating — Rethink from First Principles

## Core Job-To-Be-Done

**Primary:** Log expenses effortlessly (voice-first)  
**Secondary:** Understand spending, stay on budget, sync with partner

---

## Feature Classification

### 1. Core Essential (Must Be Free)

These are the product — gating them kills the app:

- Voice/text expense logging
- Basic categories (14 categories)
- Transaction viewing/editing/deleting
- Basic budget (monthly budget card)
- Basic analytics (monthly total, simple pie chart, trend line)
- Household pairing + real-time sync
- Day-1 push notifications
- Recurring templates library
- CSV export (already exists)

**Why free:** Day-1 experience must be complete. New user should survive without paying.

---

### 2. Nice-to-Have (Gatable)

| Feature | User Want | Marginal Cost to Me |
|---------|-----------|---------------------|
| **PDF Reports** | For tax/accountant | None |
| **Receipt Photo Storage** | Keep proof | Cloud storage |
| **Advanced Analytics** | Year-over-year, custom dates | None |
| **Multiple Budgets** | weekly/daily budgets | None |
| **Goals/Savings Tracking** | "Save for vacation" | None |
| **Investment Tracking** | Stocks/MF alongside | None |
| **Tax Export** | 80C, 80D categories | None |
| **Premium Apni Awaaz** | Deeper roasts/insights | API calls |
| **Cloud Backup** | Restore on new phone | Server cost |
| **Family Sync (3+ devices)** | Beyond couple | Complexity |

---

## Sikke vs Money Bifurcation

### Decision Framework

| Factor | Sikke Gate | Money Gate |
|--------|-----------|------------|
| Marginal cost to me | Zero | Non-zero |
| Target user | Loyal/engaged | Impatient/instant |
| Psychology | Reward engagement | Convenience purchase |

---

### Recommendation

| Feature | Gate With | Rationale |
|---------|-----------|------------|
| **PDF Reports** | Sikke (100) | Zero cost to me, rewards logging |
| **Advanced Analytics** | Sikke (200) | Zero cost, nice-to-have |
| **Goals/Savings** | Sikke (150) | Zero cost, engagement driver |
| **Tax Export** | Both (150 Sikke OR ₹20) | User choice |
| **Premium Apni Awaaz** | Both (200 Sikke OR ₹10/mo) | Higher API cost, subscription option |
| **Receipt Photo Storage** | Money only (₹20/mo) | Real storage cost |
| **Cloud Backup** | Money only (₹30/mo) | Real server cost |
| **Family Sync (3+)** | Money (₹50/mo) | Complexity, not core |

---

## The Sikke Economy Flow

```
Earn Sikke (logging, games) → Spend on: PDF, Analytics, Goals, Apni Awaaz
                              → OR Stake in Kharcha Poker (can lose)
                              → OR Save for status (future: profile tiers)
```

This avoids CRED's problem because:
1. **Spend paths exist** — not just accumulation
2. **Loss possible** — Kharcha Poker creates stakes
3. **Exclusive access** — features gated behind Sikke have real value
4. **Dual option** — users can also pay real money if they want instant