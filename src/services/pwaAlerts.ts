import { openDB } from "idb";
import type { Recurring_template, RecurringAlertQueueEntry } from "@/src/types";
import { calculateNextDueDate, getNextUpcomingDueDate } from "@/src/config/recurring";
import { DB_NAME, DB_VERSION } from "@/src/db/db";

const ALERTS_ENABLED_KEY = "kk_alerts_enabled";
const ALERTS_LAST_SYNC_KEY = "kk_alerts_last_sync_at";
const ALERTS_HASH_KEY = "kk_alerts_queue_hash";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

type AlertsStatus = "enabled" | "disabled" | "blocked" | "unsupported";

interface AlertsEnvironment {
  isSupported: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission;
}

const clampReminderDays = (value: number | undefined) => {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(7, Math.round(value)));
};

const atLocalNine = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
};

const addDaysLocal = (timestamp: number, days: number) => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

const nextNineAfter = (now: number) => {
  const todayNine = atLocalNine(now);
  if (now <= todayNine) return todayNine;
  return addDaysLocal(todayNine, 1);
};

const computeSchedule = (
  now: number,
  dueAt: number,
  reminderDays: number,
  frequency: Recurring_template["recurring_frequency"],
  endDate?: number
) => {
  let guard = 0;
  let nextDueAt = atLocalNine(dueAt);

  while (guard < 36) {
    const firstAlert = addDaysLocal(nextDueAt, -reminderDays);
    const nextFire = now <= firstAlert ? firstAlert : nextNineAfter(now);

    if (nextFire <= nextDueAt) {
      return { due_at: nextDueAt, next_fire: nextFire };
    }

    const nextCycle = calculateNextDueDate(nextDueAt, frequency);
    if (typeof endDate === "number" && nextCycle > endDate) return null;
    nextDueAt = atLocalNine(nextCycle);
    guard += 1;
  }

  return null;
};

export const getAlertsEnabled = () => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ALERTS_ENABLED_KEY) === "true";
};

export const setAlertsEnabled = (value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERTS_ENABLED_KEY, value ? "true" : "false");
};

export const getAlertsLastSyncAt = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(ALERTS_LAST_SYNC_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? null : parsed;
};

const setAlertsLastSyncAt = (value: number) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERTS_LAST_SYNC_KEY, String(value));
};

const getAlertsHash = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ALERTS_HASH_KEY);
};

const setAlertsHash = (value: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ALERTS_HASH_KEY, value);
};

export const getAlertsEnvironment = (): AlertsEnvironment => {
  if (typeof window === "undefined") {
    return {
      isSupported: false,
      isIos: false,
      isStandalone: false,
      permission: "default",
    };
  }

  const ua = window.navigator.userAgent ?? "";
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window.navigator as any).standalone);
  const isSupported = "Notification" in window && "serviceWorker" in window.navigator;
  const permission = isSupported ? window.Notification.permission : "default";

  return { isSupported, isIos, isStandalone, permission };
};

export const getAlertsStatus = (
  enabled: boolean,
  env: AlertsEnvironment
): AlertsStatus => {
  if (!env.isSupported) return "unsupported";
  if (!enabled) return "disabled";
  if (env.permission === "denied") return "blocked";
  if (env.permission === "granted") return "enabled";
  return "disabled";
};

export const requestNotificationPermission = async () => {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return window.Notification.requestPermission();
};

const registerAlertsServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in window.navigator)) return null;
  const registration = await window.navigator.serviceWorker.register("/sw.js");

  try {
    const periodic = (registration as any).periodicSync;
    if (periodic) {
      const permissionStatus = await window.navigator.permissions.query({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: "periodic-background-sync" as any,
      });
      if (permissionStatus.state === "granted") {
        await periodic.register("recurring-alerts", { minInterval: MS_PER_DAY });
      }
    }
  } catch (error) {
    // Ignore periodic sync errors; app open will still recompute.
  }

  try {
    const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (syncManager) {
      await syncManager.register("recurring-alerts");
    }
  } catch (error) {
    // Best-effort sync registration.
  }

  return registration;
};

const openAlertsDb = async () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade: (db) => {
      if (!db.objectStoreNames.contains("recurring_alerts")) {
        const alerts = db.createObjectStore("recurring_alerts", {
          keyPath: "template_id",
        });
        alerts.createIndex("by-next-fire", "next_fire");
      }
    },
  });

export const clearAlertsQueue = async () => {
  const db = await openAlertsDb();
  const tx = db.transaction("recurring_alerts", "readwrite");
  await tx.store.clear();
  await tx.done;
};

const buildAlertsHash = (templates: Recurring_template[]) => {
  const parts = [...templates]
    .map((template) => ({
      id: template._id,
      due: template.recurring_next_due_at,
      reminder: template.recurring_reminder_days ?? 0,
      end: template.recurring_end_date ?? 0,
      freq: template.recurring_frequency,
      item: template.item,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (entry) =>
        `${entry.id}:${entry.due}:${entry.reminder}:${entry.end}:${entry.freq}:${entry.item}`
    );
  return parts.join("|");
};

export const syncAlertsQueue = async (
  templates: Recurring_template[],
  options?: { now?: number; force?: boolean; minIntervalMs?: number }
) => {
  const now = options?.now ?? Date.now();
  const minInterval = options?.minIntervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const hash = buildAlertsHash(templates);
  const lastSync = getAlertsLastSyncAt();
  const lastHash = getAlertsHash();

  if (!options?.force && lastSync && now - lastSync < minInterval && hash === lastHash) {
    return;
  }
  const db = await openAlertsDb();
  const tx = db.transaction("recurring_alerts", "readwrite");
  const store = tx.store;

  const existingEntries = await store.getAll();
  const existingMap = new Map(
    existingEntries.map((entry) => [entry.template_id, entry])
  );
  const existingKeys = new Set(existingMap.keys());

  for (const template of templates) {
    if (now > template.recurring_end_date) continue;

    let dueAt = template.recurring_next_due_at;
    if (dueAt < now) {
      dueAt = getNextUpcomingDueDate(
        template.recurring_next_due_at,
        template.recurring_frequency,
        now,
        template.recurring_end_date
      );
    }

    const reminderDays = clampReminderDays(template.recurring_reminder_days ?? 0);
    const schedule = computeSchedule(
      now,
      dueAt,
      reminderDays,
      template.recurring_frequency,
      template.recurring_end_date
    );

    if (!schedule) continue;

    const existing = existingMap.get(template._id);
    const nextEntry: RecurringAlertQueueEntry = {
      template_id: template._id,
      item: template.item,
      recurring_frequency: template.recurring_frequency,
      recurring_reminder_days: reminderDays,
      due_at: schedule.due_at,
      next_fire: schedule.next_fire,
      last_fired_at: existing?.last_fired_at ?? null,
      end_date: template.recurring_end_date ?? null,
      updated_at: now,
    };

    await store.put(nextEntry);
    existingKeys.delete(template._id);
  }

  for (const stale of existingKeys) {
    await store.delete(stale);
  }

  await tx.done;

  const registration = await registerAlertsServiceWorker();
  registration?.active?.postMessage({ type: "SYNC_ALERTS" });
  setAlertsLastSyncAt(now);
  setAlertsHash(hash);
};

export const sendTestNotification = async () => {
  const registration = await registerAlertsServiceWorker();
  if (!registration) {
    return;
  }
  const controller = navigator.serviceWorker.controller;
  if (controller) {
    controller.postMessage({ type: "TEST_NOTIFICATION" });
    return;
  }
  if (!registration.active) {
    try {
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage({ type: "TEST_NOTIFICATION" });
      return;
    } catch (error) {
      return;
    }
  }
  registration.active.postMessage({ type: "TEST_NOTIFICATION" });
};

export const isAlertsReady = (enabled: boolean, env: AlertsEnvironment) => {
  if (!enabled || !env.isSupported) return false;
  if (env.permission !== "granted") return false;
  if (env.isIos && !env.isStandalone) return false;
  return true;
};
