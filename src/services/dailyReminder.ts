const ENABLED_KEY = "kk_daily_reminder";
const LAST_SCHEDULED_KEY = "kk_daily_reminder_scheduled";

export const getDailyReminderEnabled = () => {
  if (typeof window === "undefined") return true;
  const value = window.localStorage.getItem(ENABLED_KEY);
  // Default to true (enabled) if no value is set
  return value === null ? true : value === "true";
};

export const setDailyReminderEnabled = (value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ENABLED_KEY, value ? "true" : "false");
};

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

const msUntilEight = () => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 20, 0, 0);
  if (now >= target) return -1;
  return target.getTime() - now.getTime();
};

const sendCheckMessage = () => {
  navigator.serviceWorker?.controller?.postMessage({ type: "CHECK_DAILY_REMINDER" });
};

export const scheduleDailyReminder = () => {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }

  if (!getDailyReminderEnabled()) return;

  const today = new Date().toISOString().slice(0, 10);
  const lastScheduled = window.localStorage.getItem(LAST_SCHEDULED_KEY);

  const ms = msUntilEight();
  if (ms < 0) {
    // Already past 8 PM — fire immediately if not already done today
    if (lastScheduled !== today) {
      window.localStorage.setItem(LAST_SCHEDULED_KEY, today);
      sendCheckMessage();
    }
    return;
  }

  window.localStorage.setItem(LAST_SCHEDULED_KEY, today);
  scheduledTimeout = setTimeout(() => {
    sendCheckMessage();
    scheduledTimeout = null;
  }, ms);
};

export const registerDailyReminderSync = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const periodic = (registration as any).periodicSync;
    if (periodic) {
      const status = await navigator.permissions.query({
        name: "periodic-background-sync" as any,
      });
      if (status.state === "granted") {
        await periodic.register("daily-reminder", { minInterval: 24 * 60 * 60 * 1000 });
      }
    }
  } catch {
    // Best-effort
  }
};

export const unregisterDailyReminderSync = async () => {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const periodic = (registration as any).periodicSync;
    if (periodic) {
      await periodic.unregister("daily-reminder");
    }
  } catch {
    // Best-effort
  }
};
