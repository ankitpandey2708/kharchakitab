## A. Activation (Visitor → First Transaction) — DONE

| # | Suggestion | Status | Notes |
|---|---|---|---|
| A2 | Voice-first CTA ("Say 'chai 20 rupees'") | Done | Enhanced empty state in `TransactionList.tsx` using `EmptyState` with mic icon, example phrase, and bouncing arrow |
| A3 | Sample/demo transaction on empty state | Done | Ghost transaction preview (Chai / Food / Cash / ₹20) with "AI auto-fills from your voice" label, inline in `TransactionList.tsx` |
| A4 | Reduce perceived steps — single tap to start voice | Done | Pulsing ring animation (`kk-mic-ring` in `globals.css`) on mic button when ledger is empty; `isEmpty` prop piped from `TransactionList` → `page.tsx` → `BottomTabBar` |

## C. Retention — Reasons to Return

| # | Suggestion | Status | Notes |
|---|---|---|---|
| C1 | PWA install prompt after first successful transaction | Done | `usePwaInstall` hook + install banner in `page.tsx`, 2s delay after first txn, monthly dismiss cooldown |
| C2 | Daily evening reminder ("Did you log today?") | Done | Toggle in SettingsPopover, service worker checks IndexedDB at 8 PM, periodicSync fallback, `daily_reminder_toggled` event |
| C3 | Weekly spending summary on home screen | Done | Merged into single summary card — month hero total, budget bar, inline "This week" row with % change badge, top 3 category pills. Removed: today/month toggle, txn count, avg pill, pacing block, separate WeeklySummaryCard |
| C4 | Streak / consistency indicator ("5 days logged") | Done | Lightweight gamification drives daily return |

## D. Feature Discovery (Deepening Engagement) — DONE

| # | Suggestion | Rationale | Status | Notes |
|---|---|---|---|---|
| D4 | Contextual tooltips on first visit to each tab | Features exist but aren't self-explanatory | Done | Using driver.js for onboarding tooltips |


## F. Distribution & Acquisition

| # | Suggestion | Rationale | Status | Notes |
|---|---|---|---|---|
| F1 | Shareable spending summary card (social proof) | "I spent X on Food this month" → viral loop | | |