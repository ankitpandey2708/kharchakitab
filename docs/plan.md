## Recurring Alerts + Calendar Export (Local‑First)

### Scope
- Recurring templates only.
- Local‑first: no backend storage.
- No “mark paid” flow; transactions are auto‑generated.
- Templates past end date are hidden (current behavior).

---

## Track A — Real‑Time Alerts (PWA Notifications)

### A1. UX Flow
- Add an “Enable alerts” toggle in Recurring settings (default OFF).
- Show a short explainer (what alerts are, when they fire).
- On toggle ON, request notification permission.
- iOS (not installed): allow toggle, show “Add to Home Screen to get alerts.”
- Add a “Test notification” button.
- Show status: Enabled / Disabled / Blocked.

### A2. Alert Rules
- Alert window is controlled by `recurring_reminder_days`
- Copy: “Due in X days”.
- Timing:
  - Send daily alerts at 9:00 AM local time for each day from `recurring_reminder_days` down to `0` before the due date.
- Global opt‑in only (no per‑template alert toggle).
- Notifications include a “Stop for this cycle” action.

### A3. Implementation
- Ensure manifest + service worker are registered.
- Store alert settings in IndexedDB/local storage.
- Build an alerts queue (next fire times) in IndexedDB.
- Recompute queue on app open, template edit, and daily SW wake‑ups.
- Store a per‑template “snooze until next cycle” flag when user taps “Stop for this cycle.”
- `next_fire` logic:
  - If not stopped: next_fire = next due date − `k` days, where `k` is the next remaining day in the countdown from `recurring_reminder_days` down to `0` (daily alerts).
  - If stopped: next_fire = first alert time of the **next** due cycle.
  - `recurring_next_due_at` always remains the due date.
- If browser data is cleared, alerts reset (acceptable).
- Send notifications from the service worker.

### A4. QA Checklist
- iOS Safari (not installed): no alerts, install hint shown.
- iOS PWA installed: alerts fire.
- Android Chrome: alerts fire.
- Desktop Chrome/Edge/Safari: alerts fire.
- Time zone & DST handled.

---

## Track B — Calendar Export (ICS)

### B1. Entry Points
- “Add to Calendar” in Recurring view.
- “Export all” (single ICS file).

### B2. ICS Generation
- Generate `.ics` locally.
- RRULE by frequency: monthly / quarterly / half‑yearly / yearly.
- Include SUMMARY, DESCRIPTION, DTSTART (all‑day), RRULE.
- Add default alarm using `recurring_reminder_days`.
- Stable `UID` per template to reduce duplicates on re‑import.
- Optional end date if recurrence ends.

### B3. Platform Behavior
- iOS: opens Calendar app on import.
- Android: opens calendar chooser.
- Desktop: downloads `.ics` for manual import.

### B4. QA Checklist
- RRULE accuracy for each frequency.
- Import works in Google Calendar + Apple Calendar.
- Time zone / DST correctness.

---
