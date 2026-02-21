## Recurring Alerts + Calendar Export — Specification

### Scope
- Recurring templates only.
- Local‑first: no backend storage.
- No “mark paid” flow; transactions auto‑generated.
- Templates past end date are hidden.

---

## A. PWA Alerts (Real‑Time Notifications)

### A1. User Flow
- Location: Recurring view settings.
- Toggle: “Enable alerts” (default OFF).
- On toggle ON: request notification permission immediately.
- iOS Safari (not installed): allow toggle but show “Add to Home Screen to get alerts.”
- Show alert status label: Enabled / Disabled / Blocked.
- Provide “Test notification” button.

### A2. Reminder Source
- Reminder value comes from `recurring_reminder_days`.
- Allowed range: `0–7` (current UI input max).
- `recurring_reminder_days` remains per‑template.

### A3. Notification Schedule
- Copy: “Due in X days”.
- Fire time: 9:00 AM local time.
- Daily alerts from `N` down to `0` days before due date.
  - Example: due Mar 10, `N=3` → alerts on Mar 7/8/9/10 at 9:00 AM.
- If `N=0`, only the due‑day alert fires at 9:00 AM.

### A4. Stop for This Cycle
- Notification includes action: “Stop for this cycle”.
- When pressed:
  - Suppress remaining alerts for the current due date.
  - Set next alert to the first alert of the next cycle.

### A5. Data Model / Queue
- Maintain an alerts queue in IndexedDB with `next_fire` per template.
- Keep `recurring_next_due_at` (due date) separate from `next_fire` (alert time).
- Recompute queue on:
  - app open
  - template edit
  - daily service worker wake‑ups
- Clearing browser data resets alerts (acceptable).

### A6. Fallbacks
- If permission denied: keep in‑app due badges and an inline reminder to enable alerts.

### A7. Platform Behavior
- iOS Safari (not installed): no alerts, show install hint.
- iOS PWA installed: alerts fire.
- Android/desktop: alerts fire after permission granted.

---

## B. Calendar Export (ICS)

### B1. Entry Points
- Recurring view: “Add to Calendar”.
- Per‑item export + “Export all” (single `.ics` file).

### B2. ICS Content
- Generate locally in browser.
- RRULE frequencies: monthly / quarterly / half‑yearly / yearly.
- Include: SUMMARY, DESCRIPTION, DTSTART (all‑day), RRULE.
- Add default alarm using `recurring_reminder_days`.
- Use stable `UID` per template to reduce duplicates on re‑import.
- Optional end date when recurrence ends.

### B3. Platform Behavior
- iOS: opens Calendar app on import.
- Android: opens calendar chooser.
- Desktop: downloads `.ics` for manual import.

---

## Acceptance Criteria
- Alerts toggle OFF by default; permission request only on toggle ON.
- Alerts fire at 9:00 AM local time according to `recurring_reminder_days`.
- “Stop for this cycle” prevents remaining alerts until next cycle.
- Export all produces a single `.ics` with stable UIDs.

---

## Repo Integration Notes (for implementation)

### Existing PWA setup
- Manifest already wired in `app/layout.tsx` and `public/manifest.json`.
- No service worker file currently present in `public/`.

### IndexedDB usage
- DB access is via `idb` in `src/db/db.ts` (`QuickLogDB`).
- `recurring_templates` store exists with index `by-next-due`.

### Recurring UI + data flow
- Recurring list and due badges are in `src/components/RecurringView.tsx`.
- Template create/edit is in `src/components/RecurringEditModal.tsx`.
- Frequencies defined in `src/config/recurring.ts`.

### Reminder input
- `recurring_reminder_days` uses a number input with `min=0`, `max=7` in `RecurringEditModal`.
