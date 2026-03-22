import { createFeatureToggle, getMasterEnabled, postToSW, registerPeriodicSync, unregisterPeriodicSync } from "./core";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const apniAwaazToggle = createFeatureToggle("kk_apni_awaaz_enabled", true);
export const getApniAwaazEnabled = apniAwaazToggle.get;
export const setApniAwaazEnabled = apniAwaazToggle.set;

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

/** Check if today's message already exists in cache — doubles as scheduler dedup */
const alreadyGeneratedToday = () => {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const cached = window.localStorage.getItem("kk_apniAwaaz");
  if (!cached) return false;
  try {
    return JSON.parse(cached).date === today;
  } catch {
    return false;
  }
};

const msUntilNine = () => {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  if (now >= target) return -1;
  return target.getTime() - now.getTime();
};

export const scheduleApniAwaaz = () => {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  if (!getMasterEnabled() || !getApniAwaazEnabled()) return;
  if (alreadyGeneratedToday()) return;

  const ms = msUntilNine();
  if (ms < 0) {
    postToSW({ type: "GENERATE_APNI_AWAAZ" });
    return;
  }

  scheduledTimeout = setTimeout(() => {
    postToSW({ type: "GENERATE_APNI_AWAAZ" });
    scheduledTimeout = null;
  }, ms);
};

export const registerApniAwaazSync = async () => {
  await registerPeriodicSync("apni-awaaz", MS_PER_DAY);
};

export const unregisterApniAwaazSync = async () => {
  await unregisterPeriodicSync("apni-awaaz");
};
