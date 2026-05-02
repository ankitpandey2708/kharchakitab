# Voice Infrastructure — Behaviour & Roadmap

**Date:** 2026-05-02
**Reference:** [Sub-500ms Voice Agent](https://www.ntik.me/posts/voice-agent)

---

## Current State

| Feature | Implementation |
|---|---|
| Streaming LLM responses | SSE streaming with chunked text updates |
| TTS pipelining | Sentence-level TTS dispatch while LLM still streams |
| Barge-in | Cancels in-flight LLM + stops TTS on mic tap |
| TTFT tracking | PostHog event `voice_query_ttft` |
| Streaming STT | `useStreamingSTT` hook via Sarvam WebSocket |
| Server-side VAD | `END_SPEECH`/`START_SPEECH` events from Sarvam |
| Mobile hold-to-record | Hold mic to record, release to send (desktop keeps tap-toggle + VAD) |

**Estimated voice loop latency:** ~1-1.5s end-to-end

---

## P0 — Done

### 1. Streaming STT

**Implemented 2026-04-04.**

Real-time WebSocket streaming via Sarvam's `wss://api.sarvam.ai/speech-to-text-translate/ws`. Replaced batch upload — transcript is available the moment speech ends, zero upload/batch wait.

**Files:**
- **`src/hooks/useStreamingSTT.ts`** — Opens WebSocket to Sarvam, streams mic audio as PCM16 base64 chunks every 250ms, receives partial transcripts and VAD events. Exposes `{ transcript, languageCode, isStreaming, isUserSpeaking, start(), stop(), flush() }`.
- **`app/api/sarvam/token/route.ts`** — Rate-limited endpoint returning the Sarvam API key (browser WS API can't send custom headers).

**Sarvam WebSocket API details:**
- **Auth:** `api_subscription_key` query param
- **Models:** `saaras:v3` (default), `saaras:v2.5`
- **Audio input:** base64-encoded PCM16 chunks, 16kHz, sent every 250ms
- **Modes:** `transcribe`, `translate`, `verbatim`, `translit`, `codemix`
- **Flush signal:** `{"type": "flush"}` force-finalizes partial transcripts on manual stop
- **Language support:** All 22 Indic languages + English, auto-detection with confidence score

---

### 2. Server-Side VAD

**Implemented 2026-04-04.** Ships in the same `useStreamingSTT` hook via `vad_signals=true`.

- **`END_SPEECH`** → triggers transcript processing on desktop; suppressed on mobile (hold-to-record handles submission)
- **`START_SPEECH`** → triggers barge-in in AgentChat (cancel in-flight LLM + stop TTS)

**VAD sensitivity:** `high_vad_sensitivity` removed — Sarvam fires `END_SPEECH` after only 0.5s of silence with it enabled, too aggressive for natural speech pauses. Default uses 1s silence gap.

---

### 3. Mobile Hold-to-Record

**Implemented 2026-05-02.**

On mobile (`pointer: coarse`), the mic switches to WhatsApp-style hold-to-record. VAD `END_SPEECH` is suppressed — release is the sole submission trigger.

**Files:**
- **`src/hooks/useIsMobile.ts`** — SSR-safe hook using `window.matchMedia("(pointer: coarse)")`.
- **`src/components/UnifiedInputPill.tsx`** — `onPointerDown` starts recording + attaches one-shot `pointerup`/`pointercancel` listeners on `document` to stop. `preventDefault()` + `onContextMenu` block long-press context menu. `touch-action: none` prevents scroll interference.
- **`src/components/RecordingPill.tsx`** — `holdMode` prop changes label to "release to send".
- **`app/page.tsx`** — `endOfSpeechHandlerRef` returns early when `isMobile`; `onMicStart`/`onMicStop` passed separately to `UnifiedInputPill`.

**Why `document` listener instead of `setPointerCapture`:** The mic button unmounts when recording starts (AnimatePresence swaps it for RecordingPill), so `setPointerCapture` is unreliable on the original element.

**Flow:**
```
MOBILE:  pointerdown → start recording → "release to send"
         pointerup anywhere → flush + process (VAD ignored)

DESKTOP: click → start → VAD END_SPEECH → stop + process
         OR click again → manual stop + process
```

---

## P1 — High-Impact (Pending)

### 4. TTS Connection Pre-warming

Every `speakSentence()` call cold-starts a new HTTP connection to the TTS backend (~300ms overhead).

- Pre-warm connection on mic tap, not when response arrives
- Consider persistent WebSocket instead of per-sentence HTTP POSTs

**Estimated savings:** 200-400ms | **Effort:** Small

---

### 5. Chunked TTS Playback

`speakSentence()` buffers the full `res.arrayBuffer()` before playing — user waits for entire sentence to synthesize.

- Stream audio chunks from `/api/tts`, decode/play incrementally via `ReadableStream` + `AudioWorklet`

**Estimated savings:** 300-600ms | **Effort:** Medium

---

### 6. Clause-Level TTS Segmentation

Current regex `/[.!?।]\s*$/` waits for sentence-ending punctuation. Long LLM sentences delay TTS start.

- Split on clauses (commas, conjunctions, ~60-80 char chunks)
- Flush at last comma/break if buffer exceeds N chars without sentence end

**Estimated savings:** 200-500ms | **Effort:** Small

---

## P2 — Polish & Observability (Pending)

### 7. Faster Model for Voice Queries

TTFT dominates latency. Route voice queries to a faster model (Groq or smaller fine-tuned); keep heavier model for text chat.

**Estimated savings:** 200-400ms | **Effort:** Small

---

### 8. Geographic Co-location Audit

Confirm Vercel deployment is on `bom1` (Mumbai). Ensure Sarvam TTS and LLM endpoints are in the same region.

**Estimated savings:** 100-300ms | **Effort:** Small

---

### 9. Latency Telemetry Dashboard

Currently tracking: `voice_query_started`, `voice_query_ttft`, `voice_query_completed`, `voice_query_barge_in`.

Missing:
- TTS time-to-first-byte per sentence
- End-to-end voice latency (user stops speaking → first audio heard)
- Barge-in success rate

**Effort:** Small

---

## Summary

| Priority | Feature | Savings | Effort | Status |
|---|---|---|---|---|
| P0 | Streaming STT | 500-1500ms | Medium | **DONE** |
| P0 | Server-side VAD | Fewer false triggers | Medium | **DONE** |
| P0 | Mobile hold-to-record | Better UX | Small | **DONE** |
| P1 | TTS connection pre-warming | 200-400ms | Small | Pending |
| P1 | Chunked TTS playback | 300-600ms | Medium | Pending |
| P1 | Clause-level TTS segmentation | 200-500ms | Small | Pending |
| P2 | Faster model for voice | 200-400ms | Small | Pending |
| P2 | Regional co-location | 100-300ms | Small | Pending |
| P2 | Latency telemetry dashboard | Observability | Small | Pending |

**Target:** Sub-800ms end-to-end voice loop (P0 + P1 combined).
