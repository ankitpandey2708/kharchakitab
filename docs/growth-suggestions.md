# MECE Suggestions for Growth & Retention

## Context (for future sessions)

**App**: KharchaKitab — a local-first PWA expense tracker. No login/auth. Voice-first input (Hindi/English via Sarvam STT + Gemini parsing), text input, and receipt scanning. Data stored in IndexedDB. Built with Next.js App Router + TypeScript.

**PostHog setup**: Client-side via `posthog-js` (direct import, no Provider/hook). Server-side via `posthog-node` (`getPostHogClient()` from `@/src/lib/posthog-server`). No `identify()` — anonymous `distinct_id` only (no login). Server routes read `x-posthog-distinct-id` header.

**Key data points (as of Mar 5, 2026, from PostHog MCP)**:
- ~490 unique visitors over 90 days, ~472 first-timers (retention ~3.7%)
- Activation rate: 15.5% (visitor → first transaction within 7 days)
- Median time to first txn: 41 seconds (fast for those who convert)
- Voice is dominant input: 386 recordings started, 285 transcriptions completed, 202 parsed
- Receipt scanning effectively dead: 4 uses in 90 days
- Feature adoption very low: recurring_created=1, expenses_exported=4
- Massive growth spike in Mar 1-5 week (378 DAU) — likely from a share/launch event
- Many PostHog events were added recently (recurring, household, server-side errors, input_method tagging) so historical data for those is sparse

**Event instrumentation status**: 27 events tracked. Recent additions include: recurring_* events (RecurringView.tsx, RecurringEditModal.tsx), household/sync events (HouseholdView.tsx), server-side error events (gemini/receipt/sarvam/share routes), and `input_method` property on `transaction_added` (text/voice/receipt paths in app/page.tsx).

**Key files**:
- `app/page.tsx` — main page, all transaction input flows (text, voice, receipt)
- `src/components/RecurringView.tsx` — recurring expense management
- `src/components/RecurringEditModal.tsx` — create/edit recurring templates
- `src/components/HouseholdView.tsx` — household sync via WebRTC
- `app/api/gemini/route.ts` — text/voice parsing API
- `app/api/receipt/route.ts` — receipt parsing API
- `app/api/sarvam/route.ts` — speech-to-text API
- `app/api/share/submit/route.ts` — PWA share target
- `src/lib/posthog-server.ts` — server-side PostHog client
- `docs/growth-suggestions.md` — this file (MECE growth suggestions)
- `docs/todo.md` — general todo list

## A. Activation (Visitor → First Transaction) — DONE

| # | Suggestion | Status | Notes |
|---|---|---|---|
| A1 | Auto-focus input field on first visit | Removed | Conflicted with voice-first CTA (A2); dropped to keep messaging coherent |
| A2 | Voice-first CTA ("Say 'chai 20 rupees'") | Done | Enhanced empty state in `TransactionList.tsx` using `EmptyState` with mic icon, example phrase, and bouncing arrow |
| A3 | Sample/demo transaction on empty state | Done | Ghost transaction preview (Chai / Food / Cash / ₹20) with "AI auto-fills from your voice" label, inline in `TransactionList.tsx` |
| A4 | Reduce perceived steps — single tap to start voice | Done | Pulsing ring animation (`kk-mic-ring` in `globals.css`) on mic button when ledger is empty; `isEmpty` prop piped from `TransactionList` → `page.tsx` → `BottomTabBar` |

## C. Retention — Reasons to Return

| # | Suggestion | Status | Notes |
|---|---|---|---|
| C1 | PWA install prompt after first successful transaction | Done | `usePwaInstall` hook + install banner in `page.tsx`, 2s delay after first txn, monthly dismiss cooldown |
| C2 | Daily evening reminder ("Did you log today?") | Done | Toggle in SettingsPopover, service worker checks IndexedDB at 8 PM, periodicSync fallback, `daily_reminder_toggled` event |
| C3 | Weekly spending summary on home screen | Done | Merged into single summary card — month hero total, budget bar, inline "This week" row with % change badge, top 3 category pills. Removed: today/month toggle, txn count, avg pill, pacing block, separate WeeklySummaryCard |
| C4 | Streak / consistency indicator ("5 days logged") | | Lightweight gamification drives daily return |

## D. Feature Discovery (Deepening Engagement) — DONE

| # | Suggestion | Rationale | Status | Notes |
|---|---|---|---|---|
| D4 | Contextual tooltips on first visit to each tab | Features exist but aren't self-explanatory | Done | Using driver.js for onboarding tooltips |


## F. Distribution & Acquisition

| # | Suggestion | Rationale |
|---|---|---|
| F1 | Share/invite flow ("Track expenses together" via Household) | Organic growth through pairs |
| F2 | Shareable spending summary card (social proof) | "I spent X on Food this month" → viral loop |