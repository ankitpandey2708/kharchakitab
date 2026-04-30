import { openDB } from "idb";
import type { Recurring_template, RecurringAlertQueueEntry } from "@/src/types";
import { calculateNextDueDate, getNextUpcomingDueDate } from "@/src/config/recurring";
import { DB_NAME, DB_VERSION } from "@/src/db/db";
import {
  getMasterEnabled,
  registerPeriodicSync,
  registerBackgroundSync,
  postToSW,
} from "./core";

import { LS } from "@/src/config/storageKeys";

const ALERTS_LAST_SYNC_KEY = LS.ALERTS_LAST_SYNC_AT;
const ALERTS_HASH_KEY = LS.ALERTS_QUEUE_HASH;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

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

const getAlertsLastSyncAt = () => {
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
  if (!getMasterEnabled()) return;
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

  await registerPeriodicSync("recurring-alerts", MS_PER_DAY);
  await registerBackgroundSync("recurring-alerts");
  await postToSW({ type: "SYNC_ALERTS" });
  setAlertsLastSyncAt(now);
  setAlertsHash(hash);
};
