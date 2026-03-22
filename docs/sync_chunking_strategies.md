# WebRTC Sync: Chunking Strategies & Performance Analysis

## Your Current Approach

Your current sync uses **application-level chunking** at 50 transactions per chunk. Here's a summary:

| Setting               | Current Value |
|---------------------- |-------------- |
| Chunk size            | 50 transactions per chunk |
| Backpressure threshold| 64 KB (`BUFFER_THRESHOLD`) |
| Data format           | JSON → AES encrypted → JSON string |
| Sync direction        | **Bidirectional** (both sides send on `channel.onopen`) |
| Data channel mode     | Reliable + Ordered (default) |

### How a 1000 txn sync currently works (both devices have 1000 each)

1. Device A presses "Sync" → creates WebRTC offer
2. Connection established → data channel opens on **both** sides
3. **Device A** (initiator): Sends its 1000 txns in 20 chunks (50 each), sequentially, with backpressure
4. **Device B** (responder): Also sends its 1000 txns in 20 chunks (50 each), sequentially, with backpressure
5. Both sides apply incoming chunks via `applySyncPayload` (last-write-wins merge)

**Estimated payload size per chunk:**
- 1 transaction ≈ 200–400 bytes of JSON
- 50 transactions ≈ 10–20 KB of JSON
- + version_history overhead ≈ 5–10 KB
- + encryption overhead (IV + ciphertext base64) ≈ 1.3x
- **≈ 20–40 KB per encrypted chunk** ✅ Well within safe limits

---

## Key Finding: You Don't Actually Need Chunking for 1000 Transactions

Here's the math:

| Scenario        | Raw JSON Size | Encrypted Size | Safe Limit |
|---------------- |-------------- |--------------- |----------- |
| 50 txns (current chunk) | ~15 KB | ~20 KB | ✅ |
| 200 txns  | ~60 KB | ~80 KB | ✅ |
| 500 txns  | ~150 KB | ~200 KB | ⚠️ Near 256 KB Chromium limit |
| 1000 txns | ~300 KB | ~400 KB | ❌ Exceeds safe single-message limit |

**Verdict:** You can't send all 1000 in a single message, but you can **drastically increase chunk size** and reduce overhead.

---

## Recommended Strategies (Ranked by Impact)

### 1. 🚀 Increase Chunk Size to 200 Transactions

Your current chunk of 50 produces ~20 KB payloads. The safe interoperable limit per WebRTC message is **64 KB** (default SCTP), with most modern browsers supporting up to **256 KB**.

**Recommendation:** Increase `CHUNK_SIZE` from 50 → **200**.
- 200 txns ≈ 80 KB encrypted → safe for all browsers
- 1000 txns = **5 chunks** instead of 20
- Reduces per-chunk overhead (encryption setup, JSON.parse on receiver, progress callbacks, etc.)
- 4x fewer round trips through the backpressure logic

### 2. ⚡ Send All Transactions in a Single Stringified Blob (No Chunking)

If you want to eliminate chunks entirely, you can serialize all 1000 transactions into a single string, then **binary-chunk at the byte level** (not the transaction level):

```
Full payload → JSON.stringify → encrypt → Uint8Array → split into 16 KB byte-slices → send each slice → reassemble on receiver → decrypt → JSON.parse
```

**Pros:**
- Only 1 encrypt/decrypt cycle instead of 20
- Simpler sync logic (no chunk_info, no per-chunk version_history)
- Lower CPU overhead

**Cons:**
- Need to implement byte-level chunking + reassembly protocol (sequence numbers, "end" marker)
- Slightly more complex code
- Must hold entire payload in memory (fine for 400 KB, bad for 50 MB)

**For your scale (1000 txns = ~400 KB), this is viable but probably overkill.** Strategy #1 (bigger chunks) gives you 90% of the benefit with 10% of the complexity.

### 3. 🔄 True Simultaneous Bidirectional Send

Your current flow already does this correctly — both the initiator and responder fire their `channel.onopen` handlers and begin sending chunks simultaneously. This is a **major speed win** because:
- Device A doesn't wait for Device B to finish before starting its own send
- Both directions flow in parallel over the same full-duplex data channel
- Total wall-clock time ≈ max(A's send time, B's send time), not A + B

✅ **You already have this. No change needed.**

### 4. 🗜️ Compress Before Encrypting

JSON is highly compressible. Adding compression before encryption can reduce payload size by 60–80%:

```
transactions → JSON.stringify → compress (gzip/deflate) → encrypt → send
```

The browser has a built-in `CompressionStream` API (supported in Chrome 80+, Safari 16.4+):

```javascript
async function compress(data: string): Promise<ArrayBuffer> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
```

| Scenario | Raw JSON | Compressed | Encrypted |
|--------- |--------- |----------- |---------- |
| 1000 txns | ~300 KB | ~60–80 KB | ~80–100 KB |

With compression, you could potentially send **all 1000 transactions in a single message** without any chunking at all.

### 5. 📊 Delta Sync (You Already Have This)

Your `buildSyncPayload` already does delta sync by checking `getTransactionsUpdatedSince(since)`. This means on subsequent syncs, if only 5 transactions changed, you're only sending 5 — not 1000.

✅ **Already implemented. This is the single biggest performance win for repeat syncs.**

### 6. 🏎️ Use Binary Format Instead of JSON

For maximum speed, replace JSON with a binary format like MessagePack or Protocol Buffers:

| Format | 1000 txns size | Parse speed |
|------- |-------------- |------------ |
| JSON   | ~300 KB       | Baseline    |
| MessagePack | ~180 KB  | 2–5x faster |
| Protocol Buffers | ~120 KB | 5–10x faster |

**Verdict:** Overkill for your scale. JSON is fine for 1000 transactions. Worth considering if you scale to 10,000+.

---

## Summary: What to Actually Do

For your use case (2 devices, ~1000 transactions each, household expense app), here's the priority:

| Priority | Change | Effort | Impact |
|--------- |------- |------- |------- |
| **1** | Increase `CHUNK_SIZE` from 50 → 200 | 1 line change | 4x fewer chunks, faster sync |
| **2** | Add `CompressionStream` gzip before encrypt | ~20 lines | 60–80% smaller payloads |
| **3** | Keep everything else as-is | None | Already well-designed ✅ |

### Things you're already doing right:
- ✅ Bidirectional simultaneous send
- ✅ Delta sync (only changed txns)
- ✅ Backpressure with `bufferedAmount` + `onbufferedamountlow`
- ✅ Reliable + ordered channel (correct for transactional data)
- ✅ E2E encryption with shared key
- ✅ Version history for undo/audit trail

### Things to avoid:
- ❌ Don't use unreliable/unordered channels — your data requires guaranteed delivery
- ❌ Don't remove chunking entirely — keep it as a safety net for large syncs
- ❌ Don't switch to binary formats yet — JSON is fine at your scale
