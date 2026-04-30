import { createFeatureToggle, getMasterEnabled, postToSW, registerPeriodicSync, unregisterPeriodicSync } from "./core";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

import { LS } from "@/src/config/storageKeys";

const mannKiBaatToggle = createFeatureToggle(LS.MANN_KI_BAAT_ENABLED, true);
export const getMannKiBaatEnabled = mannKiBaatToggle.get;
export const setMannKiBaatEnabled = mannKiBaatToggle.set;

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null;

/** Check if today's message already exists in cache — doubles as scheduler dedup */
const alreadyGeneratedToday = () => {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const cached = window.localStorage.getItem(LS.MANN_KI_BAAT);
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

export const scheduleMannKiBaat = () => {
  if (scheduledTimeout) {
    clearTimeout(scheduledTimeout);
    scheduledTimeout = null;
  }
  if (!getMasterEnabled() || !getMannKiBaatEnabled()) return;
  if (alreadyGeneratedToday()) return;

  const ms = msUntilNine();
  if (ms < 0) {
    postToSW({ type: "GENERATE_MANN_KI_BAAT" });
    return;
  }

  scheduledTimeout = setTimeout(() => {
    postToSW({ type: "GENERATE_MANN_KI_BAAT" });
    scheduledTimeout = null;
  }, ms);
};

export const registerMannKiBaatSync = async () => {
  await registerPeriodicSync("mann-ki-baat", MS_PER_DAY);
};

export const unregisterMannKiBaatSync = async () => {
  await unregisterPeriodicSync("mann-ki-baat");
};
