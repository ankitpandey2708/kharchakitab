# spec.md - Option A Local Sync (Web URL + Cloud Signaling Only)

## Codebase Context & Integration Points (Current Repo)
- [x] S0.T1: Confirm UI entry is `app/page.tsx` (AppShell inside AppProvider); decide whether Household UI lives in this page or a new route that reuses the same layout.
- [x] S0.T2: Inventory current Transaction usage in `src/components/TransactionList.tsx`, `src/components/HistoryView.tsx`, `src/components/TransactionRow.tsx`, `src/components/TransactionActionSheet.tsx`, `src/components/EditModal.tsx` to ensure new fields are optional/handled.
- [x] S0.T3: Audit local storage: `src/db/db.ts` uses idb with store `transactions` and index `by-date` on `timestamp`; plan DB_VERSION bump + migrations.
- [x] S0.T4: Update transaction creation flows in `app/page.tsx` (voice, receipt, manual add) to populate new sync metadata (owner_device_id, created_at, updated_at, source, is_private default).
- [x] S0.T5: Add sync config in `src/config` (signaling URL, STUN/TURN URLs) and wire env vars in `.env`.

## Data Model & Local Storage (IndexedDB)
- [x] S1.T1: Extend `src/types/index.ts` Transaction with new optional fields: owner_device_id, created_at, updated_at, is_private, source (voice/manual/receipt), version, version_group_id, deleted_at (nullable).
- [x] S1.T2: Decide on tombstone strategy: use deleted_at on Transaction vs separate tombstone store; document chosen approach in types.
- [x] S1.T3: Add TransactionVersion type: version_id, transaction_id, version_index, updated_at, editor_device_id, payload_snapshot.
- [x] S1.T4: Add new object stores in IndexedDB: `transaction_versions`, `pairings`, `sync_state`, `device_identity`.
- [x] S1.T5: Bump DB_VERSION in `src/db/db.ts` and implement upgrade migration that:
  - creates new stores + indexes
  - backfills existing transactions with owner_device_id, created_at, updated_at, version=1, version_group_id=id, is_private=false, source="unknown"
- [x] S1.T6: Add indexes: `transactions.by-date` (existing), `transactions.by-updated-at`, `transactions.by-owner`, `transactions.by-private` (if needed), `transaction_versions.by-transaction`.
- [x] S1.T7: Extend DB helpers in `src/db/db.ts` to maintain updated_at, version, version history, and tombstones on add/edit/delete.
- [x] S1.T8: Add DB helpers: getTransactionsUpdatedSince, getTransactionsByOwner, getConflicts, upsertTransactionVersion, applyRemoteTransaction.
- [x] S1.T9: Ensure `queryCache` invalidation covers sync updates, version writes, and tombstone changes.


## Device Identity & Display Names
- [x] S2.T1: Generate device_id on first launch and persist in `device_identity` store.
- [x] S2.T2: Provide default display_name (e.g., "My Phone") and allow user to rename.
- [x] S2.T3: Ensure device identity is used to stamp all new transactions (owner_device_id).
- [x] S2.T4: Include device_id + display_name in discovery presence payload.

## Private Transaction Toggle
- [x] S3.T1: Add is_private boolean to transaction creation flow (default false).
- [x] S3.T2: Add Private toggle to `src/components/EditModal.tsx`.
- [x] S3.T3: Add Private toggle to `src/components/TransactionActionSheet.tsx` for quick edits.
- [x] S3.T4: Ensure private transactions are excluded from sync payloads and Household view.
- [x] S3.T5: When toggling private -> shared, mark transaction updated for next sync.
- [x] S3.T6: When toggling shared -> private, remove from Household view and mark as update.

## Edit Versioning & Conflict Rules
- [x] S4.T1: Implement append-only version history on every edit (create TransactionVersion snapshot).
- [x] S4.T2: On edit, increment version and update updated_at; store editor_device_id.
- [x] S4.T3: Define conflict detection: same transaction_id updated by both devices since last sync.
- [x] S4.T4: Define merge rule: newest version displayed by default, conflict badge shown.
- [x] S4.T5: Build conflict resolution UI (side-by-side versions + choose primary).
- [x] S4.T6: Preserve full history even after conflict resolution (no deletes).

## Sync Engine - Core
- [x] S5.T1: Create sync module (e.g., `src/services/sync/`) with clear interfaces: computeDelta, serializePayload, mergePayload.
- [x] S5.T2: Build delta computation based on updated_at > last_sync_at, excluding is_private and tombstoned entries.
- [x] S5.T3: Create sync summary model: to_send, to_receive, last_sync_at, conflicts_detected.
- [x] S5.T4: Serialize payload with version history for changed transactions only.
- [x] S5.T5: Add payload chunking + progress updates (for 1000+ txns).
- [x] S5.T6: Build merge routine: insert new, update by version, detect conflicts, apply tombstones.
- [x] S5.T7: Update last_sync_at per partner only after successful merge.
- [x] S5.T8: Persist sync status (success/fail/error reason) for UI.
- [x] S5.T9: Add hook or event emitter to refresh TransactionList/HistoryView after sync.


## Discovery & Signaling Service
- [x] S6.T1: Define signaling protocol (presence, list, offer, answer, ICE, pairing session messages).
- [x] S6.T2: Implement presence "discoverable" registration with TTL + heartbeat.
- [x] S6.T3: Implement "nearby" grouping by public IP (fallback to all discoverable).
- [x] S6.T4: Provide API to list discoverable devices with display name + short device ID.
- [x] S6.T5: Ensure signaling server stores no transaction payloads or user content.
- [x] S6.T6: Enforce strict TTL expiry for presence + pairing sessions.
- [x] S6.T7: Sanitize server logs to avoid storing device names or identifiers in plain text.
- [ ] S6.T8: Provide rate limits to prevent discovery spam.

## Pairing Flow (Code Entry on Other Device)
- [x] S7.T1: On device tap, create pairing session with session_id and one-time 4-digit code.
- [x] S7.T2: Show code on initiator; show code entry on recipient.
- [x] S7.T3: Validate code entry with retry limit and timeout.
- [x] S7.T4: On success, complete ECDH key exchange and store shared key locally.
- [x] S7.T5: On failure or timeout, clear session keys and notify both devices.
- [x] S7.T6: Prevent code reuse by marking session closed after success or timeout.

## WebRTC Connection & TURN Fallback
- [x] S8.T1: Configure STUN servers for ICE gathering.
- [ ] S8.T2: Configure TURN relay for fallback with authenticated credentials.
- [x] S8.T3: Build WebRTC offer/answer exchange via signaling.
- [x] S8.T4: Open DataChannel for sync payloads; set ordered + reliable.
- [x] S8.T5: Handle connection state events (connecting, open, failed, closed).
- [x] S8.T6: Implement reconnect logic and graceful retry.
- [x] S8.T7: Provide UI feedback for P2P vs TURN fallback (optional, non-technical).

## End-to-End Encryption
- [x] S9.T1: Use Web Crypto to generate per-device key pair for ECDH.
- [x] S9.T2: Derive shared key during pairing; store key in IndexedDB with key_id.
- [x] S9.T3: For each sync, derive a session key from shared key + nonce.
- [x] S9.T4: Encrypt payload with AES-GCM before sending.
- [x] S9.T5: Include integrity verification (GCM tag) and reject tampered payloads.
- [x] S9.T6: Ensure TURN relay never sees plaintext (payloads always encrypted).

## Household Tab UX (Integrate with Existing UI)
- [x] S10.T1: Add Household tab to main navigation (new top/bottom tab bar in `app/page.tsx`).
- [x] S10.T2: Keep Personal ledger as default tab; Household is separate view.
- [x] S10.T3: Show Household empty state explaining local-only sync and how to use "Sync Now".
- [x] S10.T4: Add "Sync Now" button and current sync status (last sync time + partner name).
- [x] S10.T5: Show nearby device list with status: paired/unpaired/connecting.
- [x] S10.T6: Use auto-list of all discoverable devices; mark paired ones distinctly.
- [x] S10.T7: Allow tap on paired device to sync without re-entering code.
- [x] S10.T8: Show sync progress bar with counts and estimated size.

## Transaction List & Labels
- [x] S11.T1: In Household view, label each transaction as "You" or partner name.
- [x] S11.T2: Add filters: All / You / Partner in Household view.
- [x] S11.T3: Keep Personal ledger unchanged; do not mix with Household by default.
- [x] S11.T4: Ensure private transactions never appear in Household.
- [x] S11.T5: Add subtle indicator for pending/processing rows so they never sync.

## Conflict Resolution UX
- [x] S12.T1: Add conflict badge on Household list when conflicts exist.
- [x] S12.T2: Add conflict center screen listing conflicting transactions.
- [x] S12.T3: Provide side-by-side view of versions with timestamps + editor names.
- [x] S12.T4: Allow selecting which version becomes primary; keep both in history.
- [x] S12.T5: Mark conflict resolved and update household view.

## Error Handling & Edge Cases
- [x] S13.T1: No devices found -> show retry and troubleshooting tips.
- [x] S13.T2: Partner offline -> show "Device not available".
- [x] S13.T3: Signaling server unreachable -> show offline error; disable sync.
- [x] S13.T4: WebRTC failed -> retry; then offer TURN fallback or stop.
- [x] S13.T5: Code entry timeout -> allow restart pairing.
- [x] S13.T6: Mid-sync disconnect -> resume or roll back safely.
- [x] S13.T7: Large sync payload -> show chunk progress and allow cancel.

## Security & Privacy Compliance
- [x] S15.T1: Ensure no transaction data is sent to server logs (ignore PostHog events).
- [x] S15.T2: Protect pairing records from XSS (sanitize, CSP headers).
- [x] S15.T3: Provide "Forget partner" option to delete pairing records and shared keys.

## Performance & Reliability
- [x] S16.T1: Optimize delta computation to avoid full table scans (use updated_at indexes).
- [x] S16.T2: Add incremental indexes on updated_at and transaction_id.
- [x] S16.T3: Throttle sync payload size; chunk at safe limits.
- [ ] S16.T4: Add retry backoff for signaling and WebRTC.
