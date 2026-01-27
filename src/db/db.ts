import { openDB, type DBSchema, type IDBPIndex } from "idb";
import type { Transaction } from "@/src/types";

interface QuickLogDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
    indexes: {
      "by-date": number;
    };
  };
}

const DB_NAME = "QuickLogDB";
const DB_VERSION = 1;
const queryCache = new Map<string, Transaction[]>();

const getDb = () =>
  openDB<QuickLogDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: "id" });
        store.createIndex("by-date", "timestamp");
      }
    },
  });

const generateId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 100) / 100;
};

const collectTransactions = async (
  index: IDBPIndex<QuickLogDB, ["transactions"], "transactions", "by-date">,
  range: IDBKeyRange | null | undefined,
  limit?: number
): Promise<Transaction[]> => {
  const results: Transaction[] = [];

  for await (const cursor of index.iterate(range, "prev")) {
    results.push(cursor.value);
    if (typeof limit === "number" && results.length >= limit) break;
  }

  return results;
};

const cacheKeyFor = (parts: Array<string | number | undefined | null>) =>
  parts.map((part) => String(part ?? "")).join("|");

const getCached = (key: string) => queryCache.get(key);
const setCached = (key: string, value: Transaction[]) => {
  queryCache.set(key, value);
  return value;
};

const clearCache = () => {
  queryCache.clear();
};

export const addTransaction = async (tx: Transaction): Promise<string> => {
  const db = await getDb();
  const transaction = {
    ...tx,
    id: tx.id || generateId(),
    amount: normalizeAmount(tx.amount),
  };
  await db.put("transactions", transaction);
  clearCache();
  return transaction.id;
};

export const getRecentTransactions = async (
  limit: number
): Promise<Transaction[]> => {
  const cacheKey = cacheKeyFor(["recent", limit]);
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const db = await getDb();
  const index = db.transaction("transactions").store.index("by-date");
  const results = await collectTransactions(index, null, limit);
  return setCached(cacheKey, results);
};

export const getTransactionsInRange = async (
  start: number,
  end: number,
  limit?: number,
  before?: number
): Promise<Transaction[]> => {
  const cacheKey = cacheKeyFor(["range", start, end, limit, before]);
  const cached = getCached(cacheKey);
  if (cached) return cached;
  const db = await getDb();
  const index = db.transaction("transactions").store.index("by-date");
  const upperBound =
    typeof before === "number" ? Math.min(end, before - 1) : end;
  if (upperBound < start) return [];
  const range = IDBKeyRange.bound(start, upperBound);
  const results = await collectTransactions(index, range, limit);
  return setCached(cacheKey, results);
};

export const updateTransaction = async (
  id: string,
  updates: Partial<Transaction>
): Promise<void> => {
  const db = await getDb();
  const existing = await db.get("transactions", id);
  if (!existing) return;
  const next =
    typeof updates.amount === "number"
      ? { ...existing, ...updates, amount: normalizeAmount(updates.amount) }
      : { ...existing, ...updates };
  await db.put("transactions", next);
  clearCache();
};

export const deleteTransaction = async (id: string): Promise<void> => {
  const db = await getDb();
  await db.delete("transactions", id);
  clearCache();
};
