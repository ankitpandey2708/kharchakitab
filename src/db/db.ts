import { openDB, type DBSchema, type IDBPIndex } from "idb";
import type {
  DeviceIdentity,
  PairingRecord,
  RecurringAlertQueueEntry,
  Recurring_template,
  SyncState,
  Transaction,
  TransactionVersion,
} from "@/src/types";
import { normalizeAmount } from "@/src/utils/money";
import { getFingerprintData, parseDeviceName } from "@/src/utils/deviceIdentity";

interface QuickLogDB {
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      "by-date": number;
      "by-updated": number;
      "by-owner": string;
      "by-private": boolean;
      "by-deleted": number;
    };
  };
  transaction_versions: {
    key: string;
    value: TransactionVersion;
    indexes: {
      "by-transaction": string;
      "by-updated": number;
    };
  };
  device_identity: {
    key: string;
    value: DeviceIdentity;
    indexes: {
      "by-name": string;
    };
  };
  pairings: {
    key: string;
    value: PairingRecord;
    indexes: {
      "by-created": number;
    };
  };
  sync_state: {
    key: string;
    value: SyncState;
    indexes: {
      "by-last-sync": number;
    };
  };
  recurring_templates: {
    key: string;
    value: Recurring_template;
    indexes: {
      "by-next-due": number;
      "by-owner": string;
    };
  };
  recurring_alerts: {
    key: string;
    value: RecurringAlertQueueEntry;
    indexes: {
      "by-next-fire": number;
    };
  };
}

export const DB_NAME = "QuickLogDB";
export const DB_VERSION = 5; // Incremented for recurring_alerts store
const MAX_CACHE_ENTRIES = 50;
const queryCache = new Map<string, Transaction[]>();
const cacheRanges = new Map<string, { start: number; end: number } | null>();
const pendingRequests = new Map<string, Promise<Transaction[]>>();
let cacheGeneration = 0;

const getDb = () =>
  openDB<QuickLogDB>(DB_NAME, DB_VERSION, {
    upgrade: async (db, oldVersion, _newVersion, transaction) => {
      let store: any;
      if (!db.objectStoreNames.contains("transactions")) {
        store = db.createObjectStore("transactions", { keyPath: "id" });
        store.createIndex("by-date", "timestamp");
      } else {
        store = transaction.objectStore("transactions");
      }

      if (!store.indexNames.contains("by-updated")) {
        store.createIndex("by-updated", "updated_at");
      }
      if (!store.indexNames.contains("by-owner")) {
        store.createIndex("by-owner", "owner_device_id");
      }
      if (!store.indexNames.contains("by-private")) {
        store.createIndex("by-private", "is_private");
      }
      if (!store.indexNames.contains("by-deleted")) {
        store.createIndex("by-deleted", "deleted_at");
      }

      if (!db.objectStoreNames.contains("transaction_versions")) {
        const versions = db.createObjectStore("transaction_versions", {
          keyPath: "version_id",
        });
        versions.createIndex("by-transaction", "transaction_id");
        versions.createIndex("by-updated", "updated_at");
      }

      if (!db.objectStoreNames.contains("device_identity")) {
        const identity = db.createObjectStore("device_identity", {
          keyPath: "device_id",
        });
        identity.createIndex("by-name", "display_name");
        identity.createIndex("by-visitor", "visitor_id", { unique: true });
      }

      if (!db.objectStoreNames.contains("pairings")) {
        const pairings = db.createObjectStore("pairings", {
          keyPath: "partner_device_id",
        });
        pairings.createIndex("by-created", "created_at");
      }

      if (!db.objectStoreNames.contains("sync_state")) {
        const syncState = db.createObjectStore("sync_state", {
          keyPath: "partner_device_id",
        });
        syncState.createIndex("by-last-sync", "last_sync_at");
      }

      if (!db.objectStoreNames.contains("recurring_templates")) {
        const templates = db.createObjectStore("recurring_templates", {
          keyPath: "_id",
        });
        templates.createIndex("by-next-due", "recurring_next_due_at");
        templates.createIndex("by-owner", "owner_device_id");
      }

      if (!db.objectStoreNames.contains("recurring_alerts")) {
        const alerts = db.createObjectStore("recurring_alerts", {
          keyPath: "template_id",
        });
        alerts.createIndex("by-next-fire", "next_fire");
      }

      if (oldVersion < 2) {
        let cursor = await store.openCursor();
        while (cursor) {
          const value = cursor.value as Transaction;
          const base = stripLegacyTxFields(value);
          const timestamp = value.timestamp ?? Date.now();
          const next: Transaction = {
            ...base,
            owner_device_id: base.owner_device_id ?? "legacy",
            created_at: base.created_at ?? timestamp,
            updated_at: base.updated_at ?? timestamp,
            is_private: base.is_private ?? false,
            version: base.version ?? 1,
            version_group_id: base.version_group_id ?? base.id,
            deleted_at: base.deleted_at ?? null,
            conflict: base.conflict ?? false,
          };
          await cursor.update(next);
          cursor = await cursor.continue();
        }
      }
    },
  });

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const generateVersionId = () => `ver_${generateId()}`;

const collectTransactions = async <
  IndexName extends keyof QuickLogDB["transactions"]["indexes"]
>(
  index: IDBPIndex<QuickLogDB, ["transactions"], "transactions", IndexName>,
  range: IDBKeyRange | null | undefined,
  limit?: number,
  predicate?: (tx: Transaction) => boolean
): Promise<Transaction[]> => {
  const results: Transaction[] = [];

  for await (const cursor of index.iterate(range, "prev")) {
    const val = cursor.value;
    if (predicate && !predicate(val)) continue;
    results.push(val);
    if (typeof limit === "number" && results.length >= limit) break;
  }

  return results;
};

const cacheKeyFor = (parts: Array<string | number | boolean | undefined | null>) =>
  parts.map((part) => String(part ?? "")).join("|");

const getCached = (key: string) => queryCache.get(key);
const setCached = (key: string, value: Transaction[], gen: number, range?: { start: number; end: number }) => {
  // RACE-1: Don't cache if an invalidation happened after this read started
  if (gen !== cacheGeneration) return value;
  // LEAK-1: Evict oldest entry when cache is full
  if (queryCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = queryCache.keys().next().value as string;
    queryCache.delete(firstKey);
    cacheRanges.delete(firstKey);
  }
  queryCache.set(key, value);
  cacheRanges.set(key, range ?? null);
  return value;
};

const invalidateCache = (timestamp?: number) => {
  cacheGeneration++;
  if (timestamp === undefined) {
    queryCache.clear();
    cacheRanges.clear();
    return;
  }
  for (const [key, range] of cacheRanges) {
    // Always invalidate entries without a range (e.g. "recent 5" queries)
    if (!range) {
      queryCache.delete(key);
      cacheRanges.delete(key);
      continue;
    }
    // Only invalidate entries whose range contains the mutation timestamp
    if (timestamp >= range.start && timestamp <= range.end) {
      queryCache.delete(key);
      cacheRanges.delete(key);
    }
  }
};

const isDeleted = (tx: Transaction) => Boolean(tx.deleted_at);

// Historical data included a `source` field on transactions. We no longer store it,
// but old records may still have it. Strip it on every write so it disappears over time.
function stripLegacyTxFields(tx: Transaction): Transaction {
  const record = tx as unknown as Record<string, unknown>;
  if (!("source" in record)) return tx;
  const { source: _ignored, ...rest } = record;
  return rest as unknown as Transaction;
}

const ensureDefaults = (
  tx: Transaction,
  overrides?: Partial<Transaction>
): Transaction => {
  const now = Date.now();
  const base = stripLegacyTxFields(tx);
  return {
    ...base,
    amount: normalizeAmount(base.amount),
    created_at: base.created_at ?? now,
    updated_at: base.updated_at ?? now,
    is_private: base.is_private ?? false,
    version: base.version ?? 1,
    version_group_id: base.version_group_id ?? base.id,
    deleted_at: base.deleted_at ?? null,
    conflict: base.conflict ?? false,
    ...overrides,
  };
};

const backfillOwnerDeviceId = async (deviceId: string) => {
  const db = await getDb();
  const tx = db.transaction("transactions", "readwrite");
  const store = tx.store;
  let cursor = await store.openCursor();
  while (cursor) {
    const value = cursor.value as Transaction;
    if (!value.owner_device_id || value.owner_device_id === "legacy") {
      await cursor.update({
        ...value,
        owner_device_id: deviceId,
        updated_at: Date.now(),
        version: value.version ?? 1,
      });
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  invalidateCache();
};

const getSmartDeviceName = () => {
  if (typeof navigator === "undefined") return "My Phone";
  const ua = navigator.userAgent;
  let device = "Device";
  if (/Windows/.test(ua)) device = "Windows PC";
  else if (/Macintosh/.test(ua)) device = "Mac";
  else if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Linux/.test(ua)) device = "Linux PC";

  let browser = "";
  if (/Edg/.test(ua)) browser = "Edge";
  else if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
  else if (/Firefox/.test(ua)) browser = "Firefox";
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = "Safari";

  return browser ? `${device} (${browser})` : device;
};

let cachedIdentity: DeviceIdentity | null = null;
let identityPromise: Promise<DeviceIdentity> | null = null;
const ACTIVE_WRITE_INTERVAL = 5 * 60 * 1000; // Throttle last_active_at writes to once per 5 min
let lastActiveWrite = 0;

const resolveDeviceIdentity = async (): Promise<DeviceIdentity> => {
  // Fetch fingerprint data first to avoid IDB transaction auto-commit issues
  let visitorId: string | undefined;
  let smartName: string | undefined;

  try {
    const fpData = await getFingerprintData();
    if (fpData) {
      visitorId = fpData.visitorId;
      smartName = parseDeviceName(fpData.components);
    }
  } catch (e) {

  }

  const db = await getDb();
  const tx = db.transaction("device_identity", "readwrite");
  const store = tx.store;
  const all = await store.getAll();
  const now = Date.now();

  // Fallback name
  if (!smartName) smartName = getSmartDeviceName();

  // Case 1: Identity exists - update last_active_at and enrich with visitor_id if needed
  if (all.length > 0) {
    const identity = { ...all[0], last_active_at: now };
    if (visitorId && !identity.visitor_id) {
      identity.visitor_id = visitorId;
    }
    if (identity.display_name === "My Phone" || identity.display_name === "Device") {
      identity.display_name = smartName;
    }
    await store.put(identity);
    await tx.done;
    lastActiveWrite = now;
    return identity;
  }

  // Case 2: No identity exists, but we have visitor_id - try to recover by visitor_id
  if (visitorId) {
    // Try to recover by visitor_id using index if available
    let recovered: DeviceIdentity | undefined;
    try {
      // Use index if it exists (new installs)
      if (store.indexNames.contains("by-visitor")) {
        recovered = await store.index("by-visitor").get(visitorId);
      } else {
        // Fallback: manual filter for existing installs without index
        const allIdentities = await store.getAll();
        recovered = allIdentities.find((id) => id.visitor_id === visitorId);
      }
    } catch (e) {

      const allIdentities = await store.getAll();
      recovered = allIdentities.find((id) => id.visitor_id === visitorId);
    }

    if (recovered) {
      // Restore the original device_id but update timestamps
      const restored: DeviceIdentity = {
        ...recovered,
        last_active_at: now,
        created_at: now, // Reset created_at to mark re-registration
      };
      await store.put(restored);
      await tx.done;
      lastActiveWrite = now;
      await backfillOwnerDeviceId(restored.device_id);
      return restored;
    }
  }

  // Case 3: No identity exists - create new
  const device_id = generateId();
  const identity: DeviceIdentity = {
    device_id,
    visitor_id: visitorId,
    display_name: smartName,
    created_at: now,
    last_active_at: now,
  };
  await store.put(identity);
  await tx.done;
  lastActiveWrite = now;
  await backfillOwnerDeviceId(device_id);
  return identity;
};

export const getDeviceIdentity = async (): Promise<DeviceIdentity> => {
  // Return cached identity immediately (covers 14 of 15 calls per session)
  if (cachedIdentity) {
    // Throttled last_active_at write — fire-and-forget, at most once per 5 min
    const now = Date.now();
    if (now - lastActiveWrite >= ACTIVE_WRITE_INTERVAL) {
      lastActiveWrite = now;
      getDb().then((db) =>
        db.put("device_identity", { ...cachedIdentity!, last_active_at: now })
      ).catch(() => {});
    }
    return cachedIdentity;
  }

  // Deduplicate concurrent first calls (e.g. multiple components mounting)
  if (!identityPromise) {
    identityPromise = resolveDeviceIdentity().then((identity) => {
      cachedIdentity = identity;
      identityPromise = null;
      return identity;
    }).catch((err) => {
      identityPromise = null;
      throw err;
    });
  }
  return identityPromise;
};

export const setDeviceDisplayName = async (displayName: string) => {
  const identity = await getDeviceIdentity();
  const updated = {
    ...identity,
    display_name: displayName.trim() || identity.display_name,
    last_active_at: Date.now(),
  };
  const db = await getDb();
  await db.put("device_identity", updated);
  cachedIdentity = updated; // Keep cache in sync
};

export const recordTransactionVersion = async (
  transaction: Transaction,
  editorDeviceId: string
) => {
  const db = await getDb();
  const version: TransactionVersion = {
    version_id: generateVersionId(),
    transaction_id: transaction.id,
    version_index: transaction.version ?? 1,
    updated_at: transaction.updated_at ?? Date.now(),
    editor_device_id: editorDeviceId,
    payload_snapshot: transaction,
  };
  await db.put("transaction_versions", version);
};

export const addTransaction = async (tx: Transaction): Promise<string> => {
  const db = await getDb();
  const identity = await getDeviceIdentity();
  const transaction = ensureDefaults({
    ...tx,
    id: tx.id || generateId(),
    owner_device_id: tx.owner_device_id ?? identity.device_id,
  });
  await db.put("transactions", transaction);
  await recordTransactionVersion(transaction, identity.device_id);
  invalidateCache(transaction.timestamp);
  return transaction.id;
};

interface FetchTransactionsOptions {
  range?: {
    start: number;
    end: number;
  };
  limit?: number;
  before?: number;
  ownerId?: string;
  includeDeleted?: boolean;
}

export const fetchTransactions = async (
  options: FetchTransactionsOptions = {}
): Promise<Transaction[]> => {
  const { range, limit, before, ownerId, includeDeleted = false } = options;

  // F: Normalize – strip `before` when it has no effect on a ranged query
  const effectiveBefore =
    range && typeof before === "number" && before - 1 >= range.end
      ? undefined
      : before;

  const cacheKey = cacheKeyFor([
    "fetch",
    range?.start,
    range?.end,
    limit,
    effectiveBefore,
    ownerId,
    includeDeleted,
  ]);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  // B: Return existing in-flight request for the same cache key
  const pending = pendingRequests.get(cacheKey);
  if (pending) return pending;

  // RACE-1: Capture generation before async work starts
  const gen = cacheGeneration;

  const promise = (async () => {
    const db = await getDb();
    const index = db.transaction("transactions").store.index("by-date");

    let keyRange: IDBKeyRange | null = null;
    if (range) {
      const upperBound =
        typeof effectiveBefore === "number"
          ? Math.min(range.end, effectiveBefore - 1)
          : range.end;
      if (upperBound < range.start) return [];
      keyRange = IDBKeyRange.bound(range.start, upperBound);
    } else if (typeof effectiveBefore === "number") {
      keyRange = IDBKeyRange.upperBound(effectiveBefore - 1);
    }

    const results = await collectTransactions(
      index,
      keyRange,
      limit,
      (tx) => {
        if (!includeDeleted && isDeleted(tx)) return false;
        if (ownerId && tx.owner_device_id !== ownerId) return false;
        return true;
      }
    );

    return setCached(cacheKey, results, gen, range);
  })();

  pendingRequests.set(cacheKey, promise);
  promise.finally(() => pendingRequests.delete(cacheKey));

  return promise;
};

export const getTransactionsUpdatedSince = async (
  since: number,
  limit?: number
): Promise<Transaction[]> => {
  const db = await getDb();
  const index = db.transaction("transactions").store.index("by-updated");
  const range = IDBKeyRange.lowerBound(since, true);
  const results = await collectTransactions(index, range, limit);
  return results;
};

export const getTransactionById = async (
  id: string
): Promise<Transaction | undefined> => {
  const db = await getDb();
  return db.get("transactions", id);
};

export const updateTransaction = async (
  id: string,
  updates: Partial<Transaction>,
  options?: {
    skipVersion?: boolean;
    updatedAt?: number;
    editorDeviceId?: string;
    overrideVersion?: number;
  }
): Promise<void> => {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing) return;
  const now = options?.updatedAt ?? Date.now();
  const nextVersion =
    options?.overrideVersion ??
    (options?.skipVersion
      ? existing.version ?? 1
      : (existing.version ?? 1) + 1);
  const next = ensureDefaults({
    ...existing,
    ...updates,
    amount:
      typeof updates.amount === "number"
        ? normalizeAmount(updates.amount)
        : existing.amount,
    updated_at: now,
    version: nextVersion,
  });
  await db.put("transactions", next);
  if (!options?.skipVersion) {
    const editorDeviceId =
      options?.editorDeviceId ??
      existing.owner_device_id ??
      (await getDeviceIdentity()).device_id;
    await recordTransactionVersion(next, editorDeviceId);
  }
  invalidateCache(existing.timestamp);
  if (typeof updates.timestamp === "number" && updates.timestamp !== existing.timestamp) {
    invalidateCache(updates.timestamp);
  }
};

export const upsertTransactionRaw = async (tx: Transaction): Promise<void> => {
  const db = await getDb();
  const existing = await db.get("transactions", tx.id);
  const next = ensureDefaults({ ...(existing ?? {}), ...tx });
  await db.put("transactions", next);
  if (existing && existing.timestamp !== tx.timestamp) {
    invalidateCache(existing.timestamp);
  }
  invalidateCache(tx.timestamp);
};

const clearTransactionHistory = async (db: any, id: string) => {
  const tx = db.transaction("transaction_versions", "readwrite");
  const versions = tx.store;
  const index = versions.index("by-transaction");
  let cursor = await index.openKeyCursor(id);
  while (cursor) {
    await versions.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing) return;

  const pairings = await getPairings();
  const txTime = existing.created_at ?? existing.timestamp;

  // A transaction is safe to hard delete if it's private or if it hasn't been synced to any partner.
  const wasNeverSynced =
    existing.is_private ||
    pairings.length === 0 ||
    pairings.every((p) => !p.last_sync_at || p.last_sync_at < txTime);

  if (wasNeverSynced) {
    // Full Hard Delete
    await db.delete("transactions", id);
    await clearTransactionHistory(db, id);
  } else {
    // Soft Delete (Keep tombstone for sync)
    await updateTransaction(
      id,
      {
        deleted_at: Date.now(),
      },
      { skipVersion: false }
    );
    // Wipe history anyway to save space
    await clearTransactionHistory(db, id);
  }
  invalidateCache(existing.timestamp);
};

export const getPairings = async (): Promise<PairingRecord[]> => {
  const db = await getDb();
  return db.getAll("pairings");
};

export const savePairing = async (record: PairingRecord): Promise<void> => {
  const db = await getDb();
  await db.put("pairings", record);
};

export const removePairing = async (partnerDeviceId: string): Promise<void> => {
  const db = await getDb();
  await db.delete("pairings", partnerDeviceId);
  await db.delete("sync_state", partnerDeviceId);
};

export const getSyncState = async (
  partnerDeviceId: string
): Promise<SyncState | undefined> => {
  const db = await getDb();
  return db.get("sync_state", partnerDeviceId);
};

export const setSyncState = async (state: SyncState): Promise<void> => {
  const db = await getDb();
  await db.put("sync_state", state);
};

export const getTransactionVersions = async (
  transactionId: string
): Promise<TransactionVersion[]> => {
  const db = await getDb();
  const index = db
    .transaction("transaction_versions")
    .store.index("by-transaction");
  const results: TransactionVersion[] = [];
  for await (const cursor of index.iterate(transactionId)) {
    results.push(cursor.value);
  }
  return results.sort((a, b) => b.updated_at - a.updated_at);
};

export const addConflict = async (
  partnerDeviceId: string,
  transactionId: string
) => {
  const state = (await getSyncState(partnerDeviceId)) ?? {
    partner_device_id: partnerDeviceId,
    last_sync_at: null,
    last_sync_cursor: null,
    conflicts: [],
  };
  const conflicts = new Set(state.conflicts ?? []);
  conflicts.add(transactionId);
  await setSyncState({ ...state, conflicts: Array.from(conflicts) });
};

export const clearConflict = async (
  partnerDeviceId: string,
  transactionId: string
) => {
  const state = await getSyncState(partnerDeviceId);
  if (!state?.conflicts) return;
  const conflicts = state.conflicts.filter((id) => id !== transactionId);
  await setSyncState({ ...state, conflicts });
};

export const isTransactionShared = async (id: string): Promise<boolean> => {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing || existing.is_private) return false;

  const pairings = await getPairings();
  const txTime = existing.created_at ?? existing.timestamp;

  return (
    pairings.length > 0 &&
    pairings.some((p) => p.last_sync_at && p.last_sync_at >= txTime)
  );
};

export const clearCacheForSync = () => {
  invalidateCache();
};
// At the end of the db.ts file - add these functions

// ===== RECURRING TEMPLATES CRUD =====

export const createRecurringTemplate = async (templateData: Omit<Recurring_template, "_id" | "created_at" | "updated_at" | "recurring_next_due_at" | "recurring_last_paid_at" | "owner_device_id" | "version">): Promise<string> => {
  const { calculateNextDueDate, getNextUpcomingDueDate } = await import("@/src/config/recurring");

  const db = await getDb();

  // Enforce uniqueness — prevent duplicates even if UI guard is bypassed
  if (templateData.recurring_template_id) {
    const all = await db.getAll("recurring_templates");
    const exists = all.some(
      (t) => t.recurring_template_id === templateData.recurring_template_id
    );
    if (exists) throw new Error("A recurring template with this ID already exists");
  }

  const identity = await getDeviceIdentity();
  const now = Date.now();
  const startDate = templateData.recurring_start_date;

  // Calculate first upcoming due date
  let nextDueAt = startDate;

  // If start_date is in the past, find next occurrence
  if (startDate < now) {
    nextDueAt = getNextUpcomingDueDate(
      startDate,
      templateData.recurring_frequency,
      now,
      templateData.recurring_end_date
    );
  }

  const template: Recurring_template = {
    ...templateData,
    _id: generateId(),
    recurring_next_due_at: nextDueAt,
    owner_device_id: identity.device_id,
    created_at: now,
    updated_at: now,
  };

  await db.put("recurring_templates", template);

  // Generate future transactions
  const transactions = await generateRecurringTransactions(template);
  for (const tx of transactions) {
    await db.put("transactions", tx);
  }

  invalidateCache();
  return template._id;
};

export const getRecurringTemplates = async (): Promise<Recurring_template[]> => {
  const db = await getDb();
  return db.getAll("recurring_templates");
};

export const updateRecurringTemplate = async (
  id: string,
  updates: Partial<Recurring_template>
): Promise<void> => {
  const { getNextUpcomingDueDate } = await import("@/src/config/recurring");

  const db = await getDb();
  const existing = await db.get("recurring_templates", id);
  if (!existing) return;

  const now = Date.now();
  let nextUpdates = { ...updates, updated_at: now };

  // Recalculate next_due_at if frequency or dates changed
  if (
    updates.recurring_frequency ||
    updates.recurring_start_date !== undefined ||
    updates.recurring_end_date !== undefined
  ) {
    const newStartDate = updates.recurring_start_date ?? existing.recurring_start_date;
    const newFrequency = updates.recurring_frequency ?? existing.recurring_frequency;
    const newEndDate = updates.recurring_end_date ?? existing.recurring_end_date;

    nextUpdates.recurring_next_due_at = getNextUpcomingDueDate(
      newStartDate,
      newFrequency,
      now,
      newEndDate
    );
  }

  const updated: Recurring_template = {
    ...existing,
    ...nextUpdates,
  };

  await db.put("recurring_templates", updated);

  // If either the old or new template uses amortization, delete from start of
  // the current month — amortized transactions are generated on the 1st, so
  // startOfToday would miss them and cause duplicates.
  // Otherwise delete from startOfToday (prevents same-day duplicate on non-amortized edits).
  const amortizationInvolved = existing.recurring_amortize || updated.recurring_amortize;
  const deleteFrom = new Date();
  if (amortizationInvolved) {
    deleteFrom.setDate(1);
  }
  deleteFrom.setHours(0, 0, 0, 0);
  await deleteGeneratedTransactions(id, deleteFrom.getTime());
  const transactions = await generateRecurringTransactions(updated);
  for (const tx of transactions) {
    await db.put("transactions", tx);
  }

  invalidateCache();
};

export const deleteRecurringTemplate = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.delete("recurring_templates", id);
  await deleteGeneratedTransactions(id, Date.now());
  invalidateCache();
};

// ===== TRANSACTION GENERATION =====

const AMORTIZE_PERIODS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

const generateRecurringTransactions = async (template: Recurring_template): Promise<Transaction[]> => {
  const { calculateNextDueDate, getNextUpcomingDueDate } = await import("@/src/config/recurring");

  const transactions: Transaction[] = [];
  const now = Date.now();
  const applyTimeOfDay = (dateTs: number, referenceTs: number) => {
    const date = new Date(dateTs);
    const reference = new Date(referenceTs);
    date.setHours(
      reference.getHours(),
      reference.getMinutes(),
      reference.getSeconds(),
      reference.getMilliseconds()
    );
    return date.getTime();
  };

  const periods = AMORTIZE_PERIODS[template.recurring_frequency] ?? 1;
  const shouldAmortize = template.recurring_amortize && periods > 1;

  if (shouldAmortize) {
    // Generate monthly transactions at amount/periods.
    // recurring_next_due_at still tracks the actual billing cycle (unchanged).
    // Last transaction absorbs any rounding remainder.
    const baseAmount = Math.floor((template.amount / periods) * 100) / 100;
    const totalBase = Math.round(baseAmount * (periods - 1) * 100) / 100;
    const lastAmount = Math.round((template.amount - totalBase) * 100) / 100;

    // Start from beginning of current month
    const startOfMonth = new Date(now);
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    let currentDate = applyTimeOfDay(startOfMonth.getTime(), now);
    const endDate = template.recurring_end_date;

    let count = 0;
    while (currentDate <= endDate) {
      count += 1;
      const isLastInCycle = count % periods === 0;
      transactions.push({
        id: generateId(),
        amount: isLastInCycle ? lastAmount : baseAmount,
        item: template.item,
        category: template.category,
        paymentMethod: template.paymentMethod,
        timestamp: currentDate,
        recurring: true,
        amortized: true,
        recurring_frequency: template.recurring_frequency,
        recurring_total_amount: template.amount,
        recurring_template_id: template._id,
        owner_device_id: template.owner_device_id,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      // Advance by one month
      const next = new Date(currentDate);
      next.setMonth(next.getMonth() + 1);
      currentDate = next.getTime();
    }

    return transactions;
  }

  // Non-amortized: original behaviour
  // Start from max(start_date, today) - ONLY FUTURE
  let currentDate = Math.max(template.recurring_start_date, now);

  // Align to next occurrence if currentDate is in the past
  if (currentDate === template.recurring_start_date && currentDate < now) {
    currentDate = getNextUpcomingDueDate(
      currentDate,
      template.recurring_frequency,
      now,
      template.recurring_end_date
    );
  }
  currentDate = applyTimeOfDay(currentDate, now);

  const endDate = template.recurring_end_date;

  while (currentDate <= endDate) {
    transactions.push({
      id: generateId(),
      amount: template.amount,
      item: template.item,
      category: template.category,
      paymentMethod: template.paymentMethod,
      timestamp: currentDate,
      recurring: true,
      recurring_template_id: template._id,
      owner_device_id: template.owner_device_id,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    currentDate = calculateNextDueDate(currentDate, template.recurring_frequency);
  }

  return transactions;
};

const deleteGeneratedTransactions = async (
  templateId: string,
  fromTimestamp?: number
): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction("transactions", "readwrite");
  const store = tx.store;

  let cursor = await store.openCursor();
  while (cursor) {
    const value = cursor.value as Transaction;
    if (value.recurring && value.recurring_template_id === templateId) {
      if (typeof fromTimestamp === "number") {
        if (value.timestamp >= fromTimestamp) {
          await cursor.delete();
        }
      } else {
        await cursor.delete();
      }
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};

// ---------------------------------------------------------------------------
// CSV Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

const VALID_CATEGORIES = new Set([
  "Food", "Travel", "Fuel", "Shopping", "Bills", "Housing",
  "Utilities", "Subscriptions", "Insurance", "Financial",
  "Home Services", "Education", "Health", "Entertainment", "Other",
]);

const VALID_PAYMENT_METHODS = new Set(["cash", "upi", "card", "unknown"]);

/** Parse a single CSV line respecting double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/**
 * Parse a date string to a Unix timestamp (ms).
 * Supports DD-MM-YYYY (our export format) and YYYY-MM-DD (ISO).
 * Returns null if unparseable.
 */
function parseDateToTimestamp(value: string): number | null {
  const ddmmyyyy = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  const yyyymmdd = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const [, yyyy, mm, dd] = yyyymmdd;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d.getTime();
  }
  return null;
}

/** Normalise a header string for case-insensitive, separator-insensitive matching. */
function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_]/g, "");
}

export const importTransactionsFromCsv = async (
  csvText: string
): Promise<ImportResult> => {
  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };

  const lines = csvText.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    result.errors.push({ row: 0, reason: "CSV has no data rows" });
    return result;
  }

  // --- Parse header ---
  const rawHeaders = parseCsvLine(lines[0]).map(normaliseHeader);

  const colIndex = (candidates: string[]): number => {
    for (const c of candidates) {
      const idx = rawHeaders.indexOf(normaliseHeader(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iDate = colIndex(["date"]);
  const iAmount = colIndex(["amount"]);
  const iItem = colIndex(["item", "description", "name"]);
  const iCategory = colIndex(["category"]);
  const iPayment = colIndex(["paymentmethod", "payment_method", "payment"]);
  const iId = colIndex(["id"]);

  if (iDate === -1 || iAmount === -1 || iItem === -1) {
    result.errors.push({
      row: 0,
      reason: "Missing required columns: Date, Amount, Item",
    });
    return result;
  }

  // --- Parse all valid rows first ---
  interface ParsedRow {
    lineNumber: number;
    csvId: string | null;
    timestamp: number;
    amount: number;
    item: string;
    category: string;
    paymentMethod: "cash" | "upi" | "card" | "unknown";
  }

  const parsed: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1; // 1-based, header = line 1
    const fields = parseCsvLine(lines[i]);

    const rawDate = iDate !== -1 ? (fields[iDate] ?? "") : "";
    const rawAmount = fields[iAmount] ?? "";
    const rawItem = iItem !== -1 ? (fields[iItem] ?? "") : "";
    const rawCategory = iCategory !== -1 ? (fields[iCategory] ?? "") : "";
    const rawPayment = iPayment !== -1 ? (fields[iPayment] ?? "") : "";
    const csvId = iId !== -1 ? (fields[iId]?.trim() || null) : null;

    // Validate date
    const timestamp = parseDateToTimestamp(rawDate.trim());
    if (timestamp === null) {
      result.errors.push({
        row: lineNumber,
        reason: `Invalid date "${rawDate}" — expected DD-MM-YYYY or YYYY-MM-DD`,
      });
      continue;
    }

    // Validate amount
    const amount = parseFloat(rawAmount.replace(/,/g, ""));
    if (isNaN(amount) || amount <= 0) {
      result.errors.push({
        row: lineNumber,
        reason: `Invalid amount "${rawAmount}" — must be a positive number`,
      });
      continue;
    }

    // Validate item
    const item = rawItem.trim();
    if (!item) {
      result.errors.push({ row: lineNumber, reason: "Item name is empty" });
      continue;
    }

    // Category: fallback to "Other" for unrecognised values
    const category = VALID_CATEGORIES.has(rawCategory.trim())
      ? rawCategory.trim()
      : "Other";

    // Payment method: fallback to "unknown"
    const paymentMethod = (
      VALID_PAYMENT_METHODS.has(rawPayment.trim().toLowerCase())
        ? rawPayment.trim().toLowerCase()
        : "unknown"
    ) as "cash" | "upi" | "card" | "unknown";

    parsed.push({ lineNumber, csvId, timestamp, amount, item, category, paymentMethod });
  }

  if (parsed.length === 0) {
    return result;
  }

  // --- Duplicate detection against existing DB transactions ---
  const db = await getDb();
  const identity = await getDeviceIdentity();

  const minTs = Math.min(...parsed.map((r) => r.timestamp));
  const maxTs = Math.max(...parsed.map((r) => r.timestamp));

  // Fetch all non-deleted transactions in the date range (± 1 day buffer)
  const existingInRange = await db.getAllFromIndex(
    "transactions",
    "by-date",
    IDBKeyRange.bound(minTs - 86_400_000, maxTs + 86_400_000)
  ) as Transaction[];

  const existingIdSet = new Set(
    existingInRange.filter((t) => t.deleted_at == null).map((t) => t.id)
  );

  const existingFuzzySet = new Set(
    existingInRange
      .filter((t) => t.deleted_at == null)
      .map((t) => {
        const day = new Date(t.timestamp);
        const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
        return `${t.item.toLowerCase()}|${t.amount}|${dayKey}`;
      })
  );

  // --- Write valid, non-duplicate rows ---
  const writeTx = db.transaction("transactions", "readwrite");
  const store = writeTx.store;
  const now = Date.now();

  for (const row of parsed) {
    // Tier 1: exact id match (re-importing own export)
    if (row.csvId && existingIdSet.has(row.csvId)) {
      result.skipped++;
      continue;
    }

    // Tier 2: fuzzy match (item + amount + calendar day)
    const day = new Date(row.timestamp);
    const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
    const fuzzyKey = `${row.item.toLowerCase()}|${row.amount}|${dayKey}`;

    if (existingFuzzySet.has(fuzzyKey)) {
      result.skipped++;
      continue;
    }

    const id = row.csvId ?? generateId();
    const transaction: Transaction = {
      id,
      amount: row.amount,
      item: row.item,
      category: row.category,
      paymentMethod: row.paymentMethod,
      timestamp: row.timestamp,
      owner_device_id: identity.device_id,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      version_group_id: id,
      conflict: false,
    };

    await store.put(transaction);
    existingIdSet.add(id);           // prevent intra-batch id duplicates
    existingFuzzySet.add(fuzzyKey);  // prevent intra-batch fuzzy duplicates
    result.imported++;
  }

  await writeTx.done;

  if (result.imported > 0) {
    invalidateCache();
  }

  return result;
};
