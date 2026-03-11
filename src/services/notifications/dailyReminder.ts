import { createFeatureToggle, getMasterEnabled, postToSW, registerPeriodicSync, unregisterPeriodicSync } from "./core";

const LAST_SCHEDULED_KEY = "kk_daily_reminder_scheduled";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const dailyToggle = createFeatureToggle("kk_daily_reminder", true);
export const getDailyReminderEnabled = dailyToggle.get;
export const setDailyReminderEnabled = dailyToggle.set;

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

const msUntilEight = () => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
  if (now >= target) return -1;
  return target.getTime() - now.getTime();
};

export const scheduleDailyReminder = () => {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }

  if (!getMasterEnabled() || !getDailyReminderEnabled()) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastScheduled = window.localStorage.getItem(LAST_SCHEDULED_KEY);

  const ms = msUntilEight();
  if (ms < 0) {
    if (lastScheduled !== today) {
      window.localStorage.setItem(LAST_SCHEDULED_KEY, today);
      postToSW({ type: "CHECK_DAILY_REMINDER" });
    }
    return;
  }

  window.localStorage.setItem(LAST_SCHEDULED_KEY, today);
  scheduledTimeout = setTimeout(() => {
    postToSW({ type: "CHECK_DAILY_REMINDER" });
    scheduledTimeout = null;
  }, ms);
};

export const registerDailyReminderSync = async () => {
  await registerPeriodicSync("daily-reminder", MS_PER_DAY);
};

export const unregisterDailyReminderSync = async () => {
  await unregisterPeriodicSync("daily-reminder");
};
