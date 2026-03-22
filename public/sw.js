/* eslint-disable no-restricted-globals */
const DB_NAME = "QuickLogDB";
const DB_VERSION = 5;
const ALERTS_STORE = "recurring_alerts";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const openDb = () =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ALERTS_STORE)) {
        const store = db.createObjectStore(ALERTS_STORE, { keyPath: "template_id" });
        store.createIndex("by-next-fire", "next_fire");
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const withStore = async (mode, fn) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALERTS_STORE, mode);
    const store = tx.objectStore(ALERTS_STORE);
    let result;

    Promise.resolve(fn(store))
      .then((value) => {
        result = value;
      })
      .catch((error) => {
        tx.abort();
        reject(error);
      });

    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

const requestToPromise = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** Single place to show any push notification from this SW. */
const notify = (title, body, options = {}) =>
  self.registration.showNotification(title, {
    icon: "/icon.svg",
    ...options,
    body,
  });

// Master toggle state — updated via SET_MASTER_ENABLED message from client.
// Defaults to true so existing users aren't broken on first SW load.
let masterEnabled = true;

const broadcastToClients = async (message) => {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => client.postMessage(message));
};

// ---------------------------------------------------------------------------
// Date math (duplicated from client because SW can't import ES modules)
// ---------------------------------------------------------------------------

const atLocalNine = (timestamp) => {
  const date = new Date(timestamp);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
};

const addDaysLocal = (timestamp, days) => {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
};

const nextNineAfter = (now) => {
  const todayNine = atLocalNine(now);
  if (now <= todayNine) return todayNine;
  return addDaysLocal(todayNine, 1);
};

const calculateNextDueDate = (fromDate, frequency) => {
  const date = new Date(fromDate);
  if (frequency === "monthly") date.setMonth(date.getMonth() + 1);
  if (frequency === "quarterly") date.setMonth(date.getMonth() + 3);
  if (frequency === "halfyearly") date.setMonth(date.getMonth() + 6);
  if (frequency === "yearly") date.setFullYear(date.getFullYear() + 1);
  return date.getTime();
};

const computeSchedule = (now, entry) => {
  let guard = 0;
  let dueAt = atLocalNine(entry.due_at);

  while (guard < 36) {
    const firstAlert = addDaysLocal(dueAt, -entry.recurring_reminder_days);
    const nextFire = now <= firstAlert ? firstAlert : nextNineAfter(now);

    if (nextFire <= dueAt) {
      return { due_at: dueAt, next_fire: nextFire };
    }

    const nextCycle = calculateNextDueDate(dueAt, entry.recurring_frequency);
    if (entry.end_date && nextCycle > entry.end_date) return null;
    dueAt = atLocalNine(nextCycle);
    guard += 1;
  }

  return null;
};

const daysBetweenLocal = (from, to) => {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(0, 0, 0, 0);
  return Math.round((toDate.getTime() - fromDate.getTime()) / MS_PER_DAY);
};

// ---------------------------------------------------------------------------
// Feature: Recurring alerts
// ---------------------------------------------------------------------------

const showRecurringAlert = async (entry, now) => {
  const daysLeft = Math.max(0, daysBetweenLocal(now, entry.due_at));
  await notify(entry.item || "Upcoming payment", `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`, {
    tag: `recurring-${entry.template_id}-${entry.due_at}`,
    data: { template_id: entry.template_id, due_at: entry.due_at },
    actions: [{ action: "stop-cycle", title: "Stop for this cycle" }],
  });
};

const processAlertsQueue = async () => {
  const now = Date.now();
  await withStore("readwrite", async (store) => {
    const allEntries = await requestToPromise(store.getAll());
    for (const entry of allEntries) {
      if (!entry || typeof entry.next_fire !== "number") continue;
      if (entry.end_date && now > entry.end_date) {
        await requestToPromise(store.delete(entry.template_id));
        continue;
      }

      if (now < entry.next_fire) continue;
      if (entry.last_fired_at && entry.last_fired_at === entry.next_fire) continue;

      await showRecurringAlert(entry, now);

      const schedule = computeSchedule(now + 1000, entry);
      if (!schedule) {
        await requestToPromise(store.delete(entry.template_id));
        continue;
      }

      await requestToPromise(
        store.put({
          ...entry,
          due_at: schedule.due_at,
          next_fire: schedule.next_fire,
          last_fired_at: entry.next_fire,
          updated_at: now,
        })
      );
    }
  });
};

const stopForThisCycle = async (templateId, dueAt) => {
  if (!templateId) return;
  const now = Date.now();
  await withStore("readwrite", async (store) => {
    const entry = await requestToPromise(store.get(templateId));
    if (!entry) return;
    if (dueAt && entry.due_at !== dueAt) return;

    const nextDue = calculateNextDueDate(entry.due_at, entry.recurring_frequency);
    if (entry.end_date && nextDue > entry.end_date) {
      await requestToPromise(store.delete(entry.template_id));
      return;
    }

    const schedule = computeSchedule(now, {
      ...entry,
      due_at: nextDue,
    });

    if (!schedule) {
      await requestToPromise(store.delete(entry.template_id));
      return;
    }

    await requestToPromise(
      store.put({
        ...entry,
        due_at: schedule.due_at,
        next_fire: schedule.next_fire,
        last_fired_at: entry.last_fired_at ?? null,
        updated_at: now,
      })
    );
  });
};

// ---------------------------------------------------------------------------
// Feature: Daily reminder
// ---------------------------------------------------------------------------

const todayStartEnd = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + MS_PER_DAY;
  return { start, end };
};

const hasTodayTransactions = async () => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("transactions", "readonly");
    const store = tx.objectStore("transactions");
    const index = store.index("by-date");
    const { start, end } = todayStartEnd();
    const range = IDBKeyRange.bound(start, end, false, true);
    const request = index.openCursor(range);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(false); return; }
      const record = cursor.value;
      if (!record._deleted) { resolve(true); return; }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
};

const checkDailyReminder = async () => {
  const hour = new Date().getHours();
  if (hour < 20) return;

  const hasEntries = await hasTodayTransactions();
  if (hasEntries) return;

  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
  await notify("KharchaKitab", "Did you log your expenses today?", {
    tag: `daily-reminder-${today}`,
    data: { type: "daily-reminder" },
  });
};

// ---------------------------------------------------------------------------
// Feature: Test notification
// ---------------------------------------------------------------------------

const handleTestNotification = async () => {
  const tag = `kk-test-alert-${Date.now()}`;
  try {
    await notify("KharchaKitab", "This is a test reminder notification.", {
      tag,
      renotify: true,
      requireInteraction: true,
      silent: false,
    });
    const notifications = await self.registration.getNotifications({ tag });
    await broadcastToClients({
      type: "TEST_NOTIFICATION_SENT",
      ok: true,
      tag,
      count: notifications.length,
    });
  } catch (error) {
    await broadcastToClients({
      type: "TEST_NOTIFICATION_SENT",
      ok: false,
      error: String(error),
      tag,
    });
  }
};

// ---------------------------------------------------------------------------
// SW lifecycle
// ---------------------------------------------------------------------------

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ---------------------------------------------------------------------------
// Message dispatch — one table, easy to extend
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Feature: Apni Awaaz — morning push teaser
// ---------------------------------------------------------------------------

const generateApniAwaaz = async () => {
  const hour = new Date().getHours();
  if (hour < 7 || hour > 12) return;

  const _d = new Date();
  const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, "0")}-${String(_d.getDate()).padStart(2, "0")}`;
  await notify("Apni Awaaz", "Teri kal ki report ready hai. Khol ke dekh.", {
    tag: `apni-awaaz-${today}`,
    data: { type: "apni-awaaz", url: "/" },
  });
};

// Handlers that should be blocked when master toggle is off
const gatedHandlers = {
  SYNC_ALERTS: () => processAlertsQueue(),
  CHECK_DAILY_REMINDER: () => checkDailyReminder(),
  GENERATE_APNI_AWAAZ: () => generateApniAwaaz(),
};

// Handlers that always work regardless of master toggle
const ungatedHandlers = {
  TEST_NOTIFICATION: () => handleTestNotification(),
  SET_MASTER_ENABLED: (event) => {
    masterEnabled = event.data.enabled !== false;
  },
};

self.addEventListener("message", (event) => {
  const { type, _masterEnabled } = event.data || {};

  // Update cached master state from every message that carries it
  if (typeof _masterEnabled === "boolean") {
    masterEnabled = _masterEnabled;
  }

  const ungated = ungatedHandlers[type];
  if (ungated) {
    ungated(event);
    return;
  }

  // Gate: if master is off, skip all notification processing
  if (!masterEnabled) return;

  const gated = gatedHandlers[type];
  if (gated) {
    event.waitUntil(gated(event));
  }
});

// ---------------------------------------------------------------------------
// Notification click dispatch
// ---------------------------------------------------------------------------

self.addEventListener("notificationclick", (event) => {
  const { action } = event;
  const data = event.notification.data || {};
  event.notification.close();

  if (action === "stop-cycle") {
    event.waitUntil(stopForThisCycle(data.template_id, data.due_at));
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        clients[0].focus();
        return;
      }
      return self.clients.openWindow("/");
    })
  );
});

// ---------------------------------------------------------------------------
// Periodic & background sync dispatch
// ---------------------------------------------------------------------------

const periodicSyncHandlers = {
  "recurring-alerts": () => processAlertsQueue(),
  "daily-reminder": () => checkDailyReminder(),
  "apni-awaaz": () => generateApniAwaaz(),
};

self.addEventListener("periodicsync", (event) => {
  if (!masterEnabled) return;
  const handler = periodicSyncHandlers[event.tag];
  if (handler) event.waitUntil(handler());
});

self.addEventListener("sync", (event) => {
  if (!masterEnabled) return;
  if (event.tag === "recurring-alerts") {
    event.waitUntil(processAlertsQueue());
  }
});
