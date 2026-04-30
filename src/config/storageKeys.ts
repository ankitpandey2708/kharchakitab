export const LS = {
  CURRENCY: "kk-currency",
  BUDGETS: "kk_budgets",
  BUDGETS_HOUSEHOLD: "kk_budgets_household",
  MANN_KI_BAAT: "kk_mannKiBaat",
  MANN_KI_BAAT_ENABLED: "kk_mann_ki_baat_enabled",
  SEEN_TIPS: "kk_seen_tips",
  INSTALL_DISMISSED: "kk_install_dismissed",
  NOTIFICATIONS_MASTER: "kk_notifications_master",
  SOUND_ENABLED: "kk_sound_enabled",
  ALERTS_ENABLED: "kk_alerts_enabled",
  ALERTS_LAST_SYNC_AT: "kk_alerts_last_sync_at",
  ALERTS_QUEUE_HASH: "kk_alerts_queue_hash",
  DAILY_REMINDER_ENABLED: "kk_daily_reminder",
  DAILY_REMINDER_SCHEDULED: "kk_daily_reminder_scheduled",
  LAST_BACKUP_AT: "kk_last_backup_at",
} as const;

type LSKey = (typeof LS)[keyof typeof LS];

export const LS_BACKUP_KEYS = Object.values(LS) as LSKey[];
