// Core — permission, environment, master toggle
export {
  getAlertsEnvironment,
  isAlertsReady,
  getMasterEnabled,
  setMasterEnabled,
  ensureNotificationsEnabled,
  getBrowserPermissionHint,
  getAlertsEnabled,
  setAlertsEnabled,
  sendTestNotification,
} from "./core";

// Recurring alerts
export {
  syncAlertsQueue,
  clearAlertsQueue,
} from "./recurring";

// Daily reminder
export {
  getDailyReminderEnabled,
  setDailyReminderEnabled,
  scheduleDailyReminder,
  registerDailyReminderSync,
  unregisterDailyReminderSync,
} from "./dailyReminder";

// Apni Awaaz
export { scheduleApniAwaaz } from "./apniAwaaz";
