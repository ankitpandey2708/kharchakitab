import { openDB } from "idb";
import { DB_NAME, DB_VERSION, DB_STORES } from "@/src/db/db";
import { LS_BACKUP_KEYS } from "@/src/config/storageKeys";

export interface BackupData {
  version: 1;
  exportedAt: string;
  localStorage: Record<string, string>;
  indexedDB: Partial<Record<(typeof DB_STORES)[number], unknown[]>>;
}

export async function serializeBackup(): Promise<BackupData> {
  const result: BackupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    localStorage: {},
    indexedDB: {},
  };

  for (const key of LS_BACKUP_KEYS) {
    const val = localStorage.getItem(key);
    if (val !== null) result.localStorage[key] = val;
  }

  const db = await openDB(DB_NAME, DB_VERSION);
  for (const store of DB_STORES) {
    const records = await db.getAll(store);
    if (records.length > 0) result.indexedDB[store] = records;
  }
  db.close();

  return result;
}

export async function deserializeBackup(
  data: BackupData
): Promise<{ txCount: number }> {
  for (const [key, value] of Object.entries(data.localStorage)) {
    localStorage.setItem(key, value);
  }

  const db = await openDB(DB_NAME, DB_VERSION);

  if ((data.indexedDB.device_identity?.length ?? 0) > 0) {
    const clearTx = db.transaction("device_identity", "readwrite");
    await clearTx.objectStore("device_identity").clear();
    await clearTx.done;
  }

  for (const store of DB_STORES) {
    const records = data.indexedDB[store];
    if (!records || records.length === 0) continue;
    const tx = db.transaction(store, "readwrite");
    for (const record of records) {
      await tx.objectStore(store).put(record);
    }
    await tx.done;
  }
  db.close();

  return { txCount: data.indexedDB.transactions?.length ?? 0 };
}
