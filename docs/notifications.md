# Notifications System

## Toggle Behaviour Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     SETTINGS POPOVER                            │
└─────────────────────────────────────────────────────────────────┘

  USER OPENS SETTINGS
         │
         ▼
  ┌─────────────────────────────────────┐
  │  🔔 Notifications      [ On | Off ] │  ← Master Toggle
  └─────────────────────────────────────┘
         │
         ├── getMasterEnabled()
         │   localStorage: null → false (new user)
         │   localStorage: "true"/"false" → existing user
         │
    ┌────┴────┐
    │         │
   OFF       ON
    │         │
    │         ▼
    │   ensureNotificationsEnabled()
    │         │
    │    ┌────┴────────────┐
    │    │                 │
    │  Browser           Browser
    │  DENIES            GRANTS
    │    │               permission
    │    │                 │
    │  stays            setMasterEnabled(true)
    │  OFF              + test notification fires
    │    │                 │
    │    │                 ▼
    │    │      ┌──────────────────────┐
    │    │      │  sub-toggles appear  │
    │    │      └──────────────────────┘
    │    │                 │
    │    │    ┌────────────┴────────────┐
    │    │    │                         │
    │    │    ▼                         ▼
    │    │  Bill Reminders          Evening Reminder
    │    │  [ On | Off ]            [ On | Off ]
    │    │  default: OFF            default: ON
    │    │    │                         │
    │    │    ▼                         ▼
    │    │  kk_alerts_enabled       kk_daily_reminder
    │    │  → syncAlertsQueue()     → scheduleDailyReminder()
    │    │    + periodicSync          + periodicSync (daily)
    │    │    + backgroundSync        + postToSW CHECK_DAILY
    │    │    + postToSW SYNC_ALERTS
    │    │
    ▼    │
  setMasterEnabled(false)
  sub-toggles HIDDEN
  show getBrowserPermissionHint()
    │
    ▼
  "To fully block, click lock icon
   in address bar → set to Block"


  ─────────────────────────────────────────────────────────────
  GATE HIERARCHY  (all must pass for any notification to fire)
  ─────────────────────────────────────────────────────────────

  getMasterEnabled()     →  false  →  NOTHING fires (hard stop)
         │ true
         ▼
  browser permission     →  !granted  →  nothing fires
         │ granted
         ▼
  isIos && !isStandalone →  true  →  nothing fires (not installed)
         │ false
         ▼
  feature toggle ON?     →  false  →  that feature skipped
         │ true
         ▼
       🔔 Notification fires via SW
```

## Key Files

| File | Role |
|---|---|
| `src/services/notifications/core.ts` | Master toggle, permission request, SW communication, `createFeatureToggle` factory |
| `src/services/notifications/recurring.ts` | Bill reminder scheduling, alerts queue sync |
| `src/services/notifications/dailyReminder.ts` | Evening reminder scheduling |
| `src/services/notifications/index.ts` | Barrel re-exports |
| `src/components/SettingsPopover.tsx` | UI for all toggles |

## localStorage Keys

| Key | Default | Purpose |
|---|---|---|
| `kk_notifications_master` | `false` | Master gate for all notifications |
| `kk_alerts_enabled` | `false` | Bill reminders feature toggle |
| `kk_daily_reminder` | `true` | Evening reminder feature toggle |
| `kk_alerts_last_sync_at` | — | Throttle for alerts queue sync |
| `kk_alerts_queue_hash` | — | Detect template changes to skip redundant syncs |
| `kk_daily_reminder_scheduled` | — | Prevent duplicate scheduling within same day |
