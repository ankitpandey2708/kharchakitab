# Plan - Option A Local Sync (Web URL, Cloud Signaling Only)

## Goals
- Enable two users to maintain personal ledgers on their own devices and merge into a unified household view without storing transaction data in the cloud.
- Provide a reliable manual "Sync Now" flow with secure pairing and conflict handling.

## Decisions Locked
- Platform: web URL only (PWA install optional but not required).
- Discovery: cloud signaling server allowed (presence + signaling only, no transaction storage).
- Connection: WebRTC peer-to-peer DataChannel, with TURN relay allowed as encrypted fallback.
- Pairing: auto-list nearby devices; user taps device; initiator shows 4-digit code; other user enters it.
- Household view: separate Household tab.
- Privacy: all transactions included by default; optional per-transaction "Private" toggle to exclude from household sync.
- Edits: allowed after sync; versioned edits with conflict badge and resolution workflow.

## Components
- Web app (browser UI + local storage + sync engine).
- Signaling service (presence, device listing, WebRTC signaling).
- TURN service (relay fallback, encrypted payloads only).

## Full Option A User Journey (Exhaustive)

### 0) First-Time App Use (Each Partner)
1. User opens the web URL on mobile browser.
2. App creates a local device identity (random device ID + default device name such as "A's Phone") stored in IndexedDB.
3. App explains privacy model: all transactions local; no cloud storage; voice/images are cleared after processing.
4. User grants microphone permission when they first use voice logging.
5. User records transactions via voice; app transcribes locally, constructs transaction records, and discards audio immediately.
6. If images are used for scanning, the image data is processed locally and discarded immediately; only structured transaction data is stored.
7. User sees Personal ledger by default.

### 1) Household Setup (First-Time Pairing)
1. User opens Household tab; sees "Sync Now" and a "Nearby devices" list (empty until discovery starts).
2. User taps "Sync Now".
3. App connects to signaling server and announces presence as "Discoverable".
4. App shows list of nearby devices (all discoverable devices in the same discovery pool; server groups by shared public IP when possible, otherwise shows all discoverable devices).
5. User taps the partner device from the list.
6. App creates a one-time pairing session and generates a 4-digit confirmation code.
7. Initiator sees the code and a prompt: "Ask your partner to enter this code on their phone."
8. Partner device receives a pairing request and shows "Enter code shown on partner device." with input.
9. Partner enters the 4-digit code.
10. If the code matches, both devices complete pairing and save a local pairing record (partner device ID, display name, shared encryption key, paired timestamp).
11. If the code does not match, both devices show an error and allow retry.
12. After successful pairing, the app performs an initial sync preview (counts of transactions to send/receive, excludes Private).
13. User confirms "Start Sync".

### 2) Initial Sync (After Pairing)
1. Devices negotiate WebRTC connection via signaling server.
2. If direct P2P fails, TURN relay is used while keeping payloads end-to-end encrypted.
3. Devices exchange sync metadata: last sync timestamp (none on first sync), device IDs, and per-device transaction change counts.
4. Each device prepares a delta payload containing only non-private transactions and their version history.
5. Payload is encrypted end-to-end and sent via WebRTC DataChannel.
6. Receiver verifies integrity, decrypts, and merges:
   - New transactions are appended.
   - Existing transactions are updated by versioning rules (see conflict handling).
7. Household tab is populated with combined view. Each transaction is labeled "You" or "Partner.".
8. App records last sync time and last sync status locally.

### 3) Subsequent Syncs (Manual "Sync Now")
1. User opens Household tab and taps "Sync Now".
2. App connects to signaling server and lists nearby devices.
3. Paired devices are marked as "Paired"; unpaired devices are shown without access.
4. User taps the paired partner device.
5. App skips code entry for known pairs and directly establishes WebRTC connection.
6. Devices exchange last sync timestamps and compute deltas only (no full table scans).
7. Transfer only transactions changed since last sync, excluding Private items.
8. Merge into Household view with versioning and conflict badges if needed.
9. Update last sync time.

### 4) Edits and Conflict Handling
1. User can edit any of their own transactions at any time.
2. Each edit creates a new version record (append-only version history).
3. If both users edit the same transaction since last sync:
   - The newer version is displayed by default.
   - A conflict badge appears.
   - Household tab offers "Resolve" with side-by-side view; user selects which version to keep as primary (older remains in history).

### 5) Private Transaction Toggle
1. User marks any transaction as "Private".
2. Private transactions never leave the device and are excluded from all sync payloads.
3. Household view does not show private entries.
4. If a transaction is toggled from Private to Shared, it is included in the next sync as a new change.

### 6) Failure/Edge Cases
1. No nearby devices: show "No devices found" with retry.
2. Partner offline or browser closed: show "Partner not available".
3. Signaling server unreachable: show offline error and disable sync.
4. WebRTC connection fails: retry and/or use TURN; if still fails, show error.
5. Code entry timed out: allow restart of pairing.
6. User cancels: disconnect safely and clear session keys.
7. Storage eviction risk: warn user and suggest install/PWA for better persistence (optional).
