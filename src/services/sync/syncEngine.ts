import type { Transaction, TransactionVersion, SyncStatus, HouseholdBudgets } from "@/src/types";
import {
  clearCacheForSync,
  getDeviceIdentity,
  getTransactionById,
  getSyncState,
  getTransactionsUpdatedSince,
  getTransactionVersions,
  recordTransactionVersion,
  setSyncState,
  upsertTransactionRaw,
  updateTransaction,
} from "@/src/db/db";
import { syncEvents } from "./syncEvents";

const CHUNK_SIZE = 200; // Max transactions per chunk — with gzip compression, ~80 KB encrypted per chunk

export type SyncPayload = {
  from_device_id: string;
  from_display_name: string;
  sent_at: number;
  last_sync_at: number | null;
  transactions: Transaction[];
  version_history: Record<string, TransactionVersion[]>; // transaction_id -> versions
  chunk_info?: {
    current: number;
    total: number;
    chunk_id: string;
  };
  household_budgets?: HouseholdBudgets;
};

// #1: Removed owner_device_id filter — any non-private, non-pending transaction
// that was edited locally will be synced. The updated_at / last_sync_at cursor
// already prevents infinite echo loops because upsertTransactionRaw preserves
// the remote's updated_at (which predates the new last_sync_at).
const isSyncable = (tx: Transaction) =>
  !tx.is_private;

// #5: Module-level snapshot cache so all chunks in one sync session read from
// the same stable list. Cleared automatically when a new session starts
// (different partner or chunk 0).
let _snapshotCache: {
  partnerDeviceId: string;
  snapshotAt: number;
  outgoing: Transaction[];
} | null = null;

export const clearSyncSnapshot = () => {
  _snapshotCache = null;
};

/**
 * S5.T4: Build sync payload WITH version history for changed transactions
 * S5.T5: Support chunking with chunk_info metadata
 */
export const buildSyncPayload = async (
  partnerDeviceId: string,
  chunkIndex = 0
): Promise<SyncPayload> => {
  const ts = () => new Date().toISOString();
  const identity = await getDeviceIdentity();

  // #5: On chunk 0 (or if cache is stale), snapshot the full outgoing set once.
  // Subsequent chunks reuse the same snapshot so the list cannot shift mid-sync.
  if (chunkIndex === 0 || !_snapshotCache || _snapshotCache.partnerDeviceId !== partnerDeviceId) {
    const syncState = await getSyncState(partnerDeviceId);
    const since = syncState?.last_sync_at ?? 0;
    const snapshotAt = Date.now();
    console.log(`[${ts()}] [SyncEngine] buildSyncPayload: partnerDeviceId=${partnerDeviceId}, chunkIndex=${chunkIndex}, since=${since} (${since === 0 ? 'first sync' : new Date(since).toISOString()})`);
    const updated = await getTransactionsUpdatedSince(since);
    console.log(`[${ts()}] [SyncEngine] buildSyncPayload: ${updated.length} transactions updated since ${since}`);
    const outgoing = updated.filter((tx) => isSyncable(tx));
    console.log(`[${ts()}] [SyncEngine] buildSyncPayload: ${outgoing.length} syncable (of ${updated.length} total, non-private, non-pending)`);

    _snapshotCache = { partnerDeviceId, snapshotAt, outgoing };

    // #2: Record the snapshot timestamp so applySyncPayload can use it
    // instead of Date.now() — prevents the mid-sync gap where transactions
    // created between buildSyncPayload and applySyncPayload are missed.
    await setSyncState({
      partner_device_id: partnerDeviceId,
      last_sync_at: syncState?.last_sync_at ?? null,
      last_sync_cursor: syncState?.last_sync_cursor ?? null,
      last_sync_status: syncState?.last_sync_status,
      last_sync_error: syncState?.last_sync_error,
      last_outgoing_snapshot_at: snapshotAt,
    });
  }

  const { outgoing, snapshotAt } = _snapshotCache;

  // Calculate chunking
  const totalChunks = Math.max(1, Math.ceil(outgoing.length / CHUNK_SIZE));
  const startIndex = chunkIndex * CHUNK_SIZE;
  const endIndex = Math.min(startIndex + CHUNK_SIZE, outgoing.length);
  const chunkedTransactions = outgoing.slice(startIndex, endIndex);
  console.log(`[${ts()}] [SyncEngine] buildSyncPayload: chunk ${chunkIndex + 1}/${totalChunks}, sending ${chunkedTransactions.length} transactions (index ${startIndex}-${endIndex})`);

  // S5.T4: Fetch version history for each transaction in chunk
  const version_history: Record<string, TransactionVersion[]> = {};
  for (const tx of chunkedTransactions) {
    const versions = await getTransactionVersions(tx.id);
    if (versions.length > 0) {
      version_history[tx.id] = versions;
    }
  }

  const payload: SyncPayload = {
    from_device_id: identity.device_id,
    from_display_name: identity.display_name,
    sent_at: snapshotAt,
    last_sync_at: _snapshotCache ? (_snapshotCache.snapshotAt) : null,
    transactions: chunkedTransactions,
    version_history,
  };

  // S5.T5: Add chunk info for progress tracking
  if (totalChunks > 1) {
    payload.chunk_info = {
      current: chunkIndex + 1,
      total: totalChunks,
      chunk_id: `${identity.device_id}_${snapshotAt}_${chunkIndex}`,
    };
  }

  // Include household budgets in first chunk only (small data, always send full map)
  if (chunkIndex === 0) {
    try {
      const stored = typeof window !== "undefined"
        ? window.localStorage.getItem("kk_budgets_household")
        : null;
      if (stored) {
        const parsed = JSON.parse(stored) as HouseholdBudgets;
        if (typeof parsed === "object" && parsed !== null) {
          payload.household_budgets = parsed;
        }
      }
    } catch {
      // localStorage read failed — skip budget sync, not critical
    }
  }

  return payload;
};

/**
 * S5.T6: Complete merge routine with tombstone handling
 * S5.T8: Persist sync status
 * S5.T9: Emit events for UI refresh
 */
export const applySyncPayload = async (
  partnerDeviceId: string,
  payload: SyncPayload,
  progressCallback?: (progress: SyncStatus["progress"]) => void
): Promise<{ incoming: number; received: number }> => {
  const ts = () => new Date().toISOString();
  const syncState = await getSyncState(partnerDeviceId);
  let received = 0;
  console.log(`[${ts()}] [SyncEngine] applySyncPayload: from=${payload.from_device_id} (${payload.from_display_name}), txns=${payload.transactions.length}, chunk=${payload.chunk_info?.current ?? 1}/${payload.chunk_info?.total ?? 1}, version_history_keys=${Object.keys(payload.version_history).length}`);

  // Emit start event
  syncEvents.emit("sync:start", { partnerDeviceId, total: payload.transactions.length });

  for (let i = 0; i < payload.transactions.length; i++) {
    const remote = payload.transactions[i];
    if (!remote) continue;

    // Skip private transactions
    if (remote.is_private) continue;

    const localRecord = await getTransactionById(remote.id);

    // S5.T6: Handle tombstones (deletions)
    // Only apply remote deletion if the remote version is >= local version.
    // This prevents a stale delete from overwriting a locally-edited transaction.
    if (remote.deleted_at) {
      if (localRecord && !localRecord.deleted_at) {
        const localVer = localRecord.version ?? 1;
        const remoteVer = remote.version ?? 1;
        if (remoteVer >= localVer) {
          await updateTransaction(
            remote.id,
            { deleted_at: remote.deleted_at },
            { skipVersion: false, editorDeviceId: remote.owner_device_id || "remote" }
          );
          received += 1;
        }
      }
      // Import version history for deleted transactions too
      const versions = payload.version_history[remote.id];
      if (versions) {
        for (const version of versions) {
          await recordTransactionVersion(version.payload_snapshot, version.editor_device_id);
        }
      }
      continue;
    }

    // New transaction - insert
    if (!localRecord) {
      await upsertTransactionRaw(remote);

      // Import version history (deterministic IDs via #10 prevent duplicates)
      const versions = payload.version_history[remote.id];
      if (versions) {
        for (const version of versions) {
          await recordTransactionVersion(version.payload_snapshot, version.editor_device_id);
        }
      }

      received += 1;

      // Emit progress
      if (progressCallback) {
        progressCallback({
          sent: 0,
          received: received,
          total_to_send: 0,
          total_to_receive: payload.transactions.length,
          current_chunk: payload.chunk_info?.current ?? 1,
          total_chunks: payload.chunk_info?.total ?? 1,
        });
      }
      continue;
    }

    // #3: Merge using version counter first (immune to clock skew),
    // fall back to updated_at only as a tiebreaker when versions match.
    const localVersion = localRecord.version ?? 1;
    const remoteVersion = remote.version ?? 1;
    const localUpdated = localRecord.updated_at ?? localRecord.timestamp;
    const remoteUpdated = remote.updated_at ?? remote.timestamp;
    const remoteWins =
      remoteVersion > localVersion ||
      (remoteVersion === localVersion && remoteUpdated > localUpdated);

    if (remoteWins) {
      await upsertTransactionRaw(remote);

      // Import version history (deterministic IDs via #10 prevent duplicates)
      const versions = payload.version_history[remote.id];
      if (versions) {
        for (const version of versions) {
          await recordTransactionVersion(version.payload_snapshot, version.editor_device_id);
        }
      }

      received += 1;
    }
  }

  // Merge household budgets (first chunk only, last-write-wins per month)
  if (payload.household_budgets && (!payload.chunk_info || payload.chunk_info.current === 1)) {
    try {
      const stored = typeof window !== "undefined"
        ? window.localStorage.getItem("kk_budgets_household")
        : null;
      const local: HouseholdBudgets = stored ? JSON.parse(stored) : {};
      let changed = false;
      for (const [month, remote] of Object.entries(payload.household_budgets)) {
        if (
          typeof remote?.amount !== "number" ||
          typeof remote?.updated_at !== "number" ||
          typeof remote?.set_by !== "string"
        ) continue; // skip invalid entries
        const existing = local[month];
        if (!existing || remote.updated_at > existing.updated_at) {
          local[month] = remote;
          changed = true;
        }
      }
      if (changed && typeof window !== "undefined") {
        window.localStorage.setItem("kk_budgets_household", JSON.stringify(local));
      }
    } catch {
      // Budget merge failed — not critical, skip
    }
  }

  // S5.T8: Update sync state with status
  // Only update last_sync_at if this is the final chunk (or not chunked)
  // to prevent skipping data if a large sync is interrupted.
  const isFinalChunk = !payload.chunk_info || payload.chunk_info.current === payload.chunk_info.total;

  // #2: Use the outgoing snapshot timestamp (recorded by buildSyncPayload) as
  // last_sync_at instead of Date.now(). This closes the race window where
  // transactions created between buildSyncPayload and applySyncPayload would
  // be permanently missed by subsequent syncs.
  const snapshotAt = syncState?.last_outgoing_snapshot_at ?? Date.now();

  const nextSyncState = {
    partner_device_id: partnerDeviceId,
    last_sync_at: isFinalChunk ? snapshotAt : (syncState?.last_sync_at ?? null),
    last_sync_cursor: Date.now(),
    last_sync_status: "success" as "success" | "failed" | "pending",
    last_sync_error: undefined,
    last_outgoing_snapshot_at: isFinalChunk ? null : syncState?.last_outgoing_snapshot_at,
  };
  await setSyncState(nextSyncState);
  clearCacheForSync();

  // #9: Renamed `sent` → `incoming` to clarify this is the count of
  // transactions the partner sent to us, not what we sent out.
  const summary = {
    incoming: payload.transactions.length,
    received,
  };

  console.log(`[${ts()}] [SyncEngine] applySyncPayload DONE: incoming=${summary.incoming}, applied=${summary.received}, chunk=${payload.chunk_info?.current ?? 1}/${payload.chunk_info?.total ?? 1}`);

  // S5.T9: Emit completion event for UI refresh
  syncEvents.emit("sync:complete", { partnerDeviceId, summary });
  syncEvents.emit("sync:refresh", { partnerDeviceId });

  return summary;
};

/**
 * S5.T8: Update sync state with error status
 */
export const recordSyncError = async (
  partnerDeviceId: string,
  error: string
): Promise<void> => {
  const syncState = await getSyncState(partnerDeviceId);
  await setSyncState({
    partner_device_id: partnerDeviceId,
    last_sync_at: syncState?.last_sync_at ?? null,
    last_sync_cursor: syncState?.last_sync_cursor ?? null,
    last_sync_status: "failed",
    last_sync_error: error,
  });

  syncEvents.emit("sync:error", { partnerDeviceId, error });
};

/**
 * S5.T5: Calculate total chunks needed for a sync.
 * Triggers snapshot creation (via buildSyncPayload chunk 0) so that
 * getTotalChunks and subsequent buildSyncPayload calls share the same
 * stable dataset — preventing chunk count mismatches.
 */
export const getTotalChunks = async (partnerDeviceId: string): Promise<number> => {
  // Populate the snapshot cache if not already set for this partner
  if (!_snapshotCache || _snapshotCache.partnerDeviceId !== partnerDeviceId) {
    await buildSyncPayload(partnerDeviceId, 0);
  }
  const count = _snapshotCache!.outgoing.length;
  return Math.max(1, Math.ceil(count / CHUNK_SIZE));
};
