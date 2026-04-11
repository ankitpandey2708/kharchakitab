# Voice Agent Optimization Roadmap

**Date:** 2026-04-04
**Reference:** [Sub-500ms Voice Agent](https://www.ntik.me/posts/voice-agent)
**Scope:** `src/components/AgentChat.tsx` and supporting voice infrastructure

---

## Current State

| Feature | Implementation |
|---|---|
| Streaming LLM responses | SSE streaming with chunked text updates |
| TTS pipelining | Sentence-level TTS dispatch while LLM still streams |
| Barge-in | Cancels in-flight LLM + stops TTS on mic tap |
| TTFT tracking | PostHog event `voice_query_ttft` |
| Streaming STT | `useStreamingSTT` hook via Sarvam WebSocket (replaced batch upload) |
| Server-side VAD | `END_SPEECH`/`START_SPEECH` events from Sarvam (replaced client-side silence timer) |

**Estimated current voice loop latency:** ~1-1.5s end-to-end (down from ~2-3s before streaming STT)

---

## P0 — Critical Path Optimizations (DONE)

### 1. Streaming STT (Replace Batch Transcription) — DONE

**Implemented 2026-04-04.**

Replaced batch `transcribeAudio()` upload with real-time WebSocket streaming via Sarvam's `wss://api.sarvam.ai/speech-to-text-translate/ws`.

**What was built:**
- **`src/hooks/useStreamingSTT.ts`** — Shared hook that opens a WebSocket to Sarvam, streams mic audio as PCM16 base64 chunks every 250ms, receives partial transcripts, and emits VAD events via callbacks. Exposes `{ transcript, languageCode, isStreaming, isUserSpeaking, start(), stop(), flush() }`.
- **`app/api/sarvam/token/route.ts`** — Rate-limited endpoint returning the Sarvam API key for client-side WebSocket auth (browser WS API doesn't support custom headers).
- **`app/page.tsx`** — Expense logging wired to `useStreamingSTT`. On `END_SPEECH` → `parseTranscript()` → save. Manual stop triggers `flush()` + processes final transcript. Double-processing guard prevents both END_SPEECH and manual stop from firing.
- **`src/components/AgentChat.tsx`** — Chat wired to `useStreamingSTT`. On `END_SPEECH` → `send(transcript, true)` to LLM with TTS pipelining. Manual stop flushes and sends.

**Flow:**
```
BEFORE:  Record full audio → silence timer stops → upload blob → batch STT → wait → process
AFTER:   Open WebSocket → stream audio live → Sarvam VAD detects END_SPEECH
         → transcript already available → immediate processing (zero upload/batch wait)
```

**Sarvam WebSocket API details:**
- **Auth:** `api_subscription_key` query param (fetched from `/api/sarvam/token`)
- **Models:** `saaras:v3` (default), `saaras:v2.5`
- **Audio input:** base64-encoded PCM16 chunks, 16kHz, sent every 250ms
- **Modes:** `transcribe`, `translate`, `verbatim`, `translit`, `codemix`
- **Flush signal:** `{"type": "flush"}` force-finalizes partial transcripts on manual stop
- **Language support:** All 22 Indic languages + English, auto-detection with confidence score

---

### 2. Semantic Turn Detection (Server-Side VAD) — DONE

**Implemented 2026-04-04.** Ships as part of the same `useStreamingSTT` hook (same WebSocket connection).

Replaced client-side RMS silence timer (`useAudioRecorder`) with Sarvam's server-side VAD via `vad_signals=true&high_vad_sensitivity=true` query parameters.

**What was built:**
- **`END_SPEECH` event** → triggers transcript processing (expense save or LLM call)
- **`START_SPEECH` event** → triggers barge-in in AgentChat (cancel in-flight LLM + stop TTS)
- Old `useAudioRecorder` retained in codebase for non-STT uses but no longer wired into voice input paths

---

## P1 — High-Impact Improvements

### 3. TTS Connection Pre-warming

**Problem:** Every `speakSentence()` call makes a fresh `fetch("/api/tts")` HTTP request. Each request cold-starts a new connection to the TTS backend.

**Article insight:** Fresh WebSocket connections to TTS add ~300ms. Pre-connected pools eliminate this.

**Solution:**
- Pre-warm TTS connection when the user taps the mic (not when the response arrives)
- Consider a persistent WebSocket to the TTS API instead of per-sentence HTTP POSTs
- At minimum, use HTTP/2 connection reuse + `keep-alive`

**Estimated savings:** 200-400ms
**Effort:** Small

---

### 4. Chunked TTS Playback

**Problem:** `speakSentence()` fetches the full sentence audio via `res.arrayBuffer()` before decoding and playing. For long sentences, the user waits for the entire sentence to synthesize.

**Article insight:** Audio frames should forward to playback without buffering the full response.

**Solution:**
- Switch to chunked TTS streaming — stream audio chunks from `/api/tts` and decode/play incrementally
- Use `ReadableStream` + `AudioWorklet` for gapless chunk playback
- Turns "wait 800ms for sentence audio" into "hear first syllable in 200ms"

**Estimated savings:** 300-600ms
**Effort:** Medium

---

### 5. Clause-Level TTS Segmentation

**Problem:** Current regex `/[.!?।]\s*$/` waits for sentence-ending punctuation. LLM output like _"Your total spending is ₹12,450 across 23 transactions including groceries, transport, and dining"_ is one long sentence — TTS won't start until the period arrives.

**Solution:**
- Split on clauses, not just sentences (commas, conjunctions, ~60-80 char chunks)
- Sliding window: if buffer exceeds N characters without a sentence end, flush at the last comma or natural break

**Estimated savings:** 200-500ms
**Effort:** Small

---

## P2 — Polish & Observability

### 6. Faster Model for Voice Queries

**Article insight:** TTFT dominates latency. Groq llama-3.3-70b delivers ~80ms TTFT vs GPT-4o-mini at 300ms+. _"TTFT accounts for more than half of total latency."_

**Solution:**
- For voice responses, route to a faster model (Groq or a smaller fine-tuned model)
- Keep the heavier model for text chat where latency tolerance is higher
- Add a `model` hint in the request body when `isVoice: true`

**Estimated savings:** 200-400ms
**Effort:** Small

---

### 7. Geographic Co-location Audit

**Article insight:** Moving to co-located infrastructure cut latency from 1.7s to 790ms.

**Solution:**
- Confirm Vercel deployment is on `bom1` (Mumbai) for Indian users
- Ensure Sarvam TTS and LLM endpoints are in the same region
- Measure per-hop latency using existing PostHog tracing

**Estimated savings:** 100-300ms
**Effort:** Small

---

### 8. Latency Telemetry Dashboard

We already track `voice_query_started`, `voice_query_ttft`, `voice_query_completed`, and `voice_query_barge_in` via PostHog.

**Missing metrics:**
- **TTS time-to-first-byte** per sentence
- **End-to-end voice latency:** time from user-stop-speaking → first audio heard (the article's key metric)
- **Interruption success rate:** did barge-in actually stop audio within 200ms?

**Solution:** Build a PostHog dashboard with these panels using existing MCP integration.

**Effort:** Small

---

## Summary

| Priority | Feature | Latency Savings | Effort | Status |
|---|---|---|---|---|
| **P0** | Streaming STT | 500-1500ms | Medium | **DONE** |
| **P0** | Semantic turn detection (VAD) | Fewer false triggers | Medium | **DONE** |
| **P1** | TTS connection pre-warming | 200-400ms | Small | Pending |
| **P1** | Chunked TTS playback | 300-600ms | Medium | Pending |
| **P1** | Clause-level TTS segmentation | 200-500ms | Small | Pending |
| **P2** | Faster model for voice | 200-400ms | Small | Pending |
| **P2** | Regional co-location | 100-300ms | Small | Pending |
| **P2** | Latency telemetry dashboard | Observability | Small | Pending |

**Target:** Sub-800ms end-to-end voice loop (P0 + P1 combined). The article identifies this as the threshold where conversations feel natural.

---

## Appendix A: Expense Logging Flow — DONE

Both `page.tsx` and `AgentChat.tsx` now share the same `useStreamingSTT` hook.

### Implemented architecture

```
useStreamingSTT (shared hook — src/hooks/useStreamingSTT.ts)
├── Opens wss://api.sarvam.ai/speech-to-text-translate/ws
├── Streams PCM16 audio chunks from mic every 250ms
├── Receives partial transcripts + VAD events
├── Exposes: { transcript, languageCode, isStreaming, isUserSpeaking, start(), stop(), flush() }
│
├── AgentChat: END_SPEECH → send to LLM, START_SPEECH → barge-in
└── page.tsx:  END_SPEECH → parseTranscript(transcript) → save
```

The old `useAudioRecorder` + batch `transcribeAudio()` path is no longer wired into either voice flow. `useAudioRecorder` remains in the codebase for non-STT uses.
