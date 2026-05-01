# Tech Spec: Recurring Template Sync

## Overview

Recurring templates are currently device-local. This spec covers extending the existing P2P sync system to sync recurring templates across paired devices so that a template created on one device appears automatically on all paired devices.

---

## Background

### Existing Sync Architecture

The app uses WebRTC P2P for data sync, with AES-256-GCM end-to-end encryption keyed from an ECDH-derived shared secret established at pairing time. The `SyncPayload` currently carries:

- `transactions` — non-private transactions updated since last sync
- `version_history` — per-transaction edit chain
- `household_budgets` — last-write-wins per month

Recurring templates are stored in the `recurring_templates` IndexedDB object store but are **not included** in `SyncPayload`.

### How Recurring Templates Generate Transactions

When a user creates or updates a recurring template, the DB layer generates all future transactions immediately and synchronously:

- `createRecurringTemplate(template)` → saves template + calls `generateRecurringTransactions(template)`
- `updateRecurringTemplate(id, patch)` → deletes future transactions from cutoff date + regenerates
- `deleteRecurringTemplate(id)` → deletes template + calls `deleteGeneratedTransactions(id, Date.now())`

Generated transactions are linked back to the template via `recurring_template_id: template._id` and flagged with `recurring: true`. These are regular transactions and already sync under the existing transaction sync.

---

## Problem Statement

When User A creates "Electricity Bill" as a recurring template:
1. The template is saved locally on User A's device
2. Future transactions are generated on User A's device
3. The generated transactions sync to User B via the existing transaction sync
4. **The template itself never syncs** — User B sees the transactions in their feed but has no recurring template, so they cannot manage, edit, or delete the recurring

Additionally, if both users independently created the same recurring template before pairing, a naive sync would result in duplicate templates and duplicate future transaction sets on both devices.

---

## Goals

- Recurring templates sync to all paired devices
- No duplicate future transactions on any device after sync
- Template conflict resolution is deterministic and automatic
- Works correctly for normal flow, update flow, delete flow, and independent-creation conflict

## Non-Goals

- Real-time push of template changes (sync remains pull-on-connect)
- Per-template privacy flag (all templates sync; a future `is_private` flag can be added later)
- Selective sync (e.g. sync templates but not transactions, or vice versa)

---

## Design

### Core Invariant

> **Only the originating device generates transactions.** The receiving device upserts the template without triggering generation, because the generated transactions already arrive via the existing transaction sync.

This mirrors the existing `upsertTransactionRaw` pattern used in `applySyncPayload` — a raw write path that bypasses business logic side effects.

---

## Changes Required

### 1. `src/types/index.ts` — Extend `SyncPayload`

```ts
export type SyncPayload = {
  from_device_id: string;
  from_display_name: string;
  sent_at: number;
  last_sync_at: number | null;
  transactions: Transaction[];
  version_history: Record<string, TransactionVersion[]>;
  chunk_info?: { current: number; total: number; chunk_id: string };
  household_budgets?: HouseholdBudgets;
  recurring_templates?: Recurring_template[];   // NEW
};
```

Recurring templates are included in **chunk 0 only** (same as `household_budgets`). There will typically be <50 templates so no chunking is needed for them.

---

### 2. `src/db/db.ts` — New Functions

#### `upsertRecurringTemplateRaw(template: Recurring_template): Promise<void>`

Writes the template directly to the `recurring_templates` object store. **Does not call `generateRecurringTransactions`.**

```ts
async function upsertRecurringTemplateRaw(template: Recurring_template): Promise<void> {
  const db = await getDB();
  await db.put("recurring_templates", template);
}
```

#### `findConflictingRecurringTemplate(incoming: Recurring_template): Promise<Recurring_template | null>`

Checks whether a local template with a **different `_id`** already exists for the same logical recurring expense.

Match criteria: `item + category + recurring_frequency + amount`

```ts
async function findConflictingRecurringTemplate(
  incoming: Recurring_template
): Promise<Recurring_template | null> {
  const all = await getRecurringTemplates();
  return (
    all.find(
      (t) =>
        t._id !== incoming._id &&
        t.item === incoming.item &&
        t.category === incoming.category &&
        t.recurring_frequency === incoming.recurring_frequency &&
        t.amount === incoming.amount
    ) ?? null
  );
}
```

---

### 3. `src/services/sync/syncEngine.ts` — `buildSyncPayload()`

Attach recurring templates to the first chunk:

```ts
if (chunkIndex === 0) {
  payload.household_budgets = ...;              // existing
  payload.recurring_templates = await getRecurringTemplates();  // NEW
}
```

---

### 4. `src/services/sync/syncEngine.ts` — `applySyncPayload()`

Process incoming recurring templates after transactions are applied:

```ts
for (const remote of payload.recurring_templates ?? []) {
  const conflict = await findConflictingRecurringTemplate(remote);

  if (conflict) {
    // Both devices independently created the same recurring — keep the older one
    const loser  = conflict.created_at <= remote.created_at ? remote : conflict;
    const winner = loser === remote ? conflict : remote;
    await deleteRecurringTemplate(loser._id);      // deletes template + future txns
    await upsertRecurringTemplateRaw(winner);
  } else {
    // Same _id (version conflict) or net-new template
    const local = await getRecurringTemplateById(remote._id);
    if (!local) {
      await upsertRecurringTemplateRaw(remote);
    } else {
      const remoteWins =
        (remote.version ?? 0) > (local.version ?? 0) ||
        ((remote.version ?? 0) === (local.version ?? 0) &&
          remote.updated_at > local.updated_at);
      if (remoteWins) {
        await upsertRecurringTemplateRaw(remote);
      }
    }
  }
}

// Refresh notification queue after any template changes
const allTemplates = await getRecurringTemplates();
await syncAlertsQueue(allTemplates, { force: true });
```

---

## Conflict Resolution Rules

### Same `_id` (same template, version divergence)

| Condition | Winner |
|-----------|--------|
| `remote.version > local.version` | Remote |
| `remote.version === local.version` and `remote.updated_at > local.updated_at` | Remote |
| Otherwise | Local (no-op) |

This matches the existing transaction conflict resolution strategy.

### Different `_id`, same content (independently created)

| Condition | Winner |
|-----------|--------|
| `conflict.created_at <= remote.created_at` | Local (conflict) |
| `remote.created_at < conflict.created_at` | Remote |

The loser is deleted via `deleteRecurringTemplate(loser._id)`, which removes the template and all its generated future transactions. The winner's transactions are already present from the transaction sync.

### Different `_id`, different content (genuinely different recurrings)

No conflict detected. Both templates coexist. This is correct — e.g. User A has "Electricity ₹1500/month" and User B has "Electricity ₹1800/month" are treated as different templates.

---

## Scenario Walkthroughs

### Normal Flow

```
User A: creates "Electricity Bill" (id: AAA)
        → template saved, transactions generated (Jan–Dec)

[sync occurs]

User B: receives Jan–Dec transactions via existing tx sync
        receives template AAA via new template sync
        → upsertRecurringTemplateRaw(AAA)   ← no generation
        → no duplicate transactions ✅
```

### Template Update

```
User A: updates "Electricity Bill" (AAA) amount ₹1500 → ₹1800, version 1 → 2
        → deletes old future txns, regenerates with new amount

[sync occurs]

User B: receives updated transactions (version bumped, remote wins in conflict resolution)
        receives template AAA v2
        → upsertRecurringTemplateRaw(AAA v2)   ← no generation
        → correct transactions on both devices ✅
```

### Template Delete

```
User A: deletes "Electricity Bill" (AAA)
        → template removed, future txns deleted locally

[sync occurs — template no longer in payload]

User B: template AAA is no longer sent
        → User B's copy of AAA persists until they also delete it
```

> **Note:** Template deletion is not propagated in this spec. Deletions are a separate concern (tombstone records) and can be addressed in a follow-up.

### Independent Creation Conflict

```
User A: creates "Electricity Bill" (id: AAA, created_at: T1)
        → txns generated with recurring_template_id: AAA

User B: creates "Electricity Bill" (id: BBB, created_at: T2, T2 > T1)
        → txns generated with recurring_template_id: BBB

[sync occurs — both get each other's templates and txns]

applySyncPayload on User A (receives BBB):
  findConflictingRecurringTemplate(BBB) → finds AAA
  AAA.created_at (T1) <= BBB.created_at (T2) → AAA wins
  deleteRecurringTemplate(BBB) → removes BBB + its future txns
  upsertRecurringTemplateRaw(AAA) → no-op (already local)

applySyncPayload on User B (receives AAA):
  findConflictingRecurringTemplate(AAA) → finds BBB
  AAA.created_at (T1) < BBB.created_at (T2) → AAA wins
  deleteRecurringTemplate(BBB) → removes BBB + its future txns
  upsertRecurringTemplateRaw(AAA) → writes AAA

Both devices end up with only AAA and AAA's transactions ✅
BBB's transactions are cleaned up on both sides ✅
```

---

## What Is Not Changing

- The WebRTC connection, encryption, chunking, and signaling layers are unchanged
- Transaction sync is unchanged — generated transactions continue to sync as regular transactions
- `createRecurringTemplate`, `updateRecurringTemplate`, `deleteRecurringTemplate` are unchanged on the originating device
- The `RecurringView` component requires no changes

---

## Future Work

- **Deletion propagation** — tombstone records so deletes sync across devices
- **Per-template privacy flag** — `is_private: true` on a template excludes it from sync (mirrors existing transaction privacy)
- **Post-sync UI notification** — surface newly synced recurring templates to the user ("2 recurring expenses added from Ankit's phone")
