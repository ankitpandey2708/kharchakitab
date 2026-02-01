import { openDB, type DBSchema, type IDBPIndex } from "idb";
import type {
  DeviceIdentity,
  PairingRecord,
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
}

const DB_NAME = "QuickLogDB";
const DB_VERSION = 4; // Incremented for recurring_templates store
const queryCache = new Map<string, Transaction[]>();

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
const setCached = (key: string, value: Transaction[]) => {
  queryCache.set(key, value);
  return value;
};

const clearCache = () => {
  queryCache.clear();
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

export const getDeviceIdentity = async (): Promise<DeviceIdentity> => {
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
  await backfillOwnerDeviceId(device_id);
  return identity;
};

export const setDeviceDisplayName = async (displayName: string) => {
  const identity = await getDeviceIdentity();
  const db = await getDb();
  await db.put("device_identity", {
    ...identity,
    display_name: displayName.trim() || identity.display_name,
    last_active_at: Date.now(),
  });
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
  clearCache();
  return transaction.id;
};

export interface FetchTransactionsOptions {
  range?: {
    start: number;
    end: number;
  };
  limit?: number;
  before?: number;
  ownerId?: string;
  excludeRecurring?: boolean;
  includeDeleted?: boolean;
}

export const fetchTransactions = async (
  options: FetchTransactionsOptions = {}
): Promise<Transaction[]> => {
  const {
    range,
    limit,
    before,
    ownerId,
    excludeRecurring = false,
    includeDeleted = false,
  } = options;

  const cacheKey = cacheKeyFor([
    "fetch",
    range?.start,
    range?.end,
    limit,
    before,
    ownerId,
    excludeRecurring,
    includeDeleted,
  ]);
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const db = await getDb();
  const index = db.transaction("transactions").store.index("by-date");

  let keyRange: IDBKeyRange | null = null;
  if (range) {
    const upperBound =
      typeof before === "number" ? Math.min(range.end, before - 1) : range.end;
    if (upperBound < range.start) return [];
    keyRange = IDBKeyRange.bound(range.start, upperBound);
  } else if (typeof before === "number") {
    keyRange = IDBKeyRange.upperBound(before - 1);
  }

  const results = await collectTransactions(
    index,
    keyRange,
    limit,
    (tx) => {
      if (!includeDeleted && isDeleted(tx)) return false;
      if (ownerId && tx.owner_device_id !== ownerId) return false;
      if (excludeRecurring && tx.recurring_template_id) return false;
      return true;
    }
  );

  return setCached(cacheKey, results);
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
  clearCache();
};

export const upsertTransactionRaw = async (tx: Transaction): Promise<void> => {
  const db = await getDb();
  const existing = await db.get("transactions", tx.id);
  const next = ensureDefaults({ ...(existing ?? {}), ...tx });
  await db.put("transactions", next);
  clearCache();
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
  clearCache();
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
  clearCache();
};
// At the end of the db.ts file - add these functions

// ===== RECURRING TEMPLATES CRUD =====

export const createRecurringTemplate = async (templateData: Omit<Recurring_template, "_id" | "created_at" | "updated_at" | "recurring_next_due_at" | "recurring_last_paid_at" | "owner_device_id" | "version">): Promise<string> => {
  const { calculateNextDueDate, getNextUpcomingDueDate } = await import("@/src/config/recurring");

  const db = await getDb();
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
  console.info("[recurring:create] next-due", {
    startDate,
    now,
    frequency: templateData.recurring_frequency,
    endDate: templateData.recurring_end_date,
    nextDueAt,
  });

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
  console.info("[recurring:create] generated", {
    templateId: template._id,
    count: transactions.length,
    firstTs: transactions[0]?.timestamp ?? null,
    lastTs: transactions[transactions.length - 1]?.timestamp ?? null,
  });
  for (const tx of transactions) {
    await db.put("transactions", tx);
  }

  clearCache();
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
    console.info("[recurring:update] next-due", {
      id,
      newStartDate,
      newFrequency,
      newEndDate,
      now,
      nextDueAt: nextUpdates.recurring_next_due_at,
    });
  }

  const updated: Recurring_template = {
    ...existing,
    ...nextUpdates,
  };

  await db.put("recurring_templates", updated);

  // Delete and regenerate transactions
  await deleteGeneratedTransactions(id);
  const transactions = await generateRecurringTransactions(updated);
  console.info("[recurring:update] regenerated", {
    templateId: id,
    count: transactions.length,
    firstTs: transactions[0]?.timestamp ?? null,
    lastTs: transactions[transactions.length - 1]?.timestamp ?? null,
  });
  for (const tx of transactions) {
    await db.put("transactions", tx);
  }

  clearCache();
};

export const deleteRecurringTemplate = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.delete("recurring_templates", id);
  await deleteGeneratedTransactions(id);
  clearCache();
};

// ===== TRANSACTION GENERATION =====

const generateRecurringTransactions = async (template: Recurring_template): Promise<Transaction[]> => {
  const { calculateNextDueDate, getNextUpcomingDueDate } = await import("@/src/config/recurring");

  const transactions: Transaction[] = [];
  const now = Date.now();

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

  const endDate = template.recurring_end_date;
  console.info("[recurring:generate] start", {
    templateId: template._id,
    startDate: template.recurring_start_date,
    now,
    firstDate: currentDate,
    endDate,
    frequency: template.recurring_frequency,
  });

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

const deleteGeneratedTransactions = async (templateId: string): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction("transactions", "readwrite");
  const store = tx.store;

  let cursor = await store.openCursor();
  while (cursor) {
    const value = cursor.value as Transaction;
    if (value.recurring && value.recurring_template_id === templateId) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
};
