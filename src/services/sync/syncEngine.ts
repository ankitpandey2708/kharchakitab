import type { Transaction, TransactionVersion, SyncStatus } from "@/src/types";
import {
  addConflict,
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

const CHUNK_SIZE = 50; // Max transactions per chunk for safe WebRTC payload size

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
};

export type SyncSummary = {
  sent: number;
  received: number;
  conflicts: number;
};

const isPendingTransaction = (tx: Transaction) =>
  tx.item === "Processing…" || tx.item.startsWith("Processing ");

const isSyncable = (tx: Transaction, localDeviceId: string) =>
  !tx.is_private &&
  !isPendingTransaction(tx) &&
  tx.owner_device_id === localDeviceId;

/**
 * S5.T4: Build sync payload WITH version history for changed transactions
 * S5.T5: Support chunking with chunk_info metadata
 */
export const buildSyncPayload = async (
  partnerDeviceId: string,
  chunkIndex = 0
): Promise<SyncPayload> => {
  const identity = await getDeviceIdentity();
  const syncState = await getSyncState(partnerDeviceId);
  const since = syncState?.last_sync_at ?? 0;
  const updated = await getTransactionsUpdatedSince(since);
  const outgoing = updated.filter((tx) => isSyncable(tx, identity.device_id));

  // Calculate chunking
  const totalChunks = Math.max(1, Math.ceil(outgoing.length / CHUNK_SIZE));
  const startIndex = chunkIndex * CHUNK_SIZE;
  const endIndex = Math.min(startIndex + CHUNK_SIZE, outgoing.length);
  const chunkedTransactions = outgoing.slice(startIndex, endIndex);

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
    sent_at: Date.now(),
    last_sync_at: syncState?.last_sync_at ?? null,
    transactions: chunkedTransactions,
    version_history,
  };

  // S5.T5: Add chunk info for progress tracking
  if (totalChunks > 1) {
    payload.chunk_info = {
      current: chunkIndex + 1,
      total: totalChunks,
      chunk_id: `${identity.device_id}_${Date.now()}_${chunkIndex}`,
    };
  }

  return payload;
};

const detectConflict = (
  local: Transaction,
  remote: Transaction,
  lastSyncAt: number | null
) => {
  if (!lastSyncAt) return false;
  const localUpdated = local.updated_at ?? local.timestamp;
  const remoteUpdated = remote.updated_at ?? remote.timestamp;
  if (localUpdated <= lastSyncAt || remoteUpdated <= lastSyncAt) return false;
  return localUpdated !== remoteUpdated;
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
): Promise<SyncSummary> => {
  const identity = await getDeviceIdentity();
  const syncState = await getSyncState(partnerDeviceId);
  const lastSyncAt = syncState?.last_sync_at ?? null;
  let received = 0;
  let conflicts = 0;

  // Emit start event
  syncEvents.emit("sync:start", { partnerDeviceId, total: payload.transactions.length });

  for (let i = 0; i < payload.transactions.length; i++) {
    const remote = payload.transactions[i];
    if (!remote) continue;

    // Skip private transactions
    if (remote.is_private) continue;

    const localRecord = await getTransactionById(remote.id);

    // S5.T6: Handle tombstones (deletions)
    if (remote.deleted_at) {
      if (localRecord && !localRecord.deleted_at) {
        // Apply remote deletion
        await updateTransaction(
          remote.id,
          { deleted_at: remote.deleted_at },
          { skipVersion: false, editorDeviceId: remote.owner_device_id || "remote" }
        );
        received += 1;
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
      await upsertTransactionRaw({ ...remote, conflict: false });
      await recordTransactionVersion(remote, remote.owner_device_id || "remote");

      // Import version history
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

    // Conflict detection
    const isConflict = detectConflict(localRecord, remote, lastSyncAt);
    if (isConflict) {
      conflicts += 1;
      await addConflict(partnerDeviceId, remote.id);
      const newer =
        (remote.updated_at ?? remote.timestamp) >=
          (localRecord.updated_at ?? localRecord.timestamp)
          ? remote
          : localRecord;
      await upsertTransactionRaw({
        ...newer,
        conflict: true,
      });
      await recordTransactionVersion(remote, remote.owner_device_id || "remote");

      // Import version history for conflicts
      const versions = payload.version_history[remote.id];
      if (versions) {
        for (const version of versions) {
          await recordTransactionVersion(version.payload_snapshot, version.editor_device_id);
        }
      }
      continue;
    }

    // Update if remote is newer
    const localUpdated = localRecord.updated_at ?? localRecord.timestamp;
    const remoteUpdated = remote.updated_at ?? remote.timestamp;
    if (remoteUpdated > localUpdated) {
      await upsertTransactionRaw({ ...remote, conflict: false });
      await recordTransactionVersion(remote, remote.owner_device_id || "remote");

      // Import version history
      const versions = payload.version_history[remote.id];
      if (versions) {
        for (const version of versions) {
          await recordTransactionVersion(version.payload_snapshot, version.editor_device_id);
        }
      }

      received += 1;
    }
  }

  // S5.T8: Update sync state with status
  // Only update last_sync_at if this is the final chunk (or not chunked)
  // to prevent skipping data if a large sync is interrupted.
  const isFinalChunk = !payload.chunk_info || payload.chunk_info.current === payload.chunk_info.total;

  const nextSyncState = {
    partner_device_id: partnerDeviceId,
    last_sync_at: isFinalChunk ? Date.now() : (syncState?.last_sync_at ?? null),
    last_sync_cursor: Date.now(),
    conflicts: syncState?.conflicts ?? [],
    last_sync_status: (conflicts > 0 ? "success" : "success") as "success" | "failed" | "pending",
    last_sync_error: undefined,
  };
  await setSyncState(nextSyncState);
  clearCacheForSync();

  const summary = {
    sent: payload.transactions.length,
    received,
    conflicts,
  };

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
    conflicts: syncState?.conflicts ?? [],
    last_sync_status: "failed",
    last_sync_error: error,
  });

  syncEvents.emit("sync:error", { partnerDeviceId, error });
};

/**
 * S5.T5: Calculate total chunks needed for a sync
 */
export const getTotalChunks = async (partnerDeviceId: string): Promise<number> => {
  const syncState = await getSyncState(partnerDeviceId);
  const since = syncState?.last_sync_at ?? 0;
  const updated = await getTransactionsUpdatedSince(since);
  const identity = await getDeviceIdentity();
  const outgoing = updated.filter((tx) => isSyncable(tx, identity.device_id));
  return Math.max(1, Math.ceil(outgoing.length / CHUNK_SIZE));
};

