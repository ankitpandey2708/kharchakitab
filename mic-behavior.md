# Mic Behavior Guidelines

Use this doc as the single source of truth for mic behavior, troubleshooting, and tuning.

## Recording Flow (Do This)

- **Start trigger:** Use click/tap to toggle recording (click-start, click-stop).
- **Media permissions:** Call `navigator.mediaDevices.getUserMedia({ audio: true })`. If unsupported or denied, set an error and alert the user.
- **Recording pipeline:** Start `MediaRecorder`, buffer chunks in `chunksRef`, and assemble a single `audio/webm` blob on stop.
- **Silence detection:** Use `AudioContext` + `AnalyserNode` to compute RMS every 0.2s. If RMS < 0.02 for > 0.6s, auto-stop after the initial 2s warm-up.
- **Hard timeout:** Force stop after 8s even if silence detection fails.
- **Manual stop:** Let users tap again to stop immediately.
- **Stop flow:** Call `stopRecording()`, stop `MediaRecorder`, resolve `{ audioBlob, duration }`, then tear down tracks, intervals, and audio context.
- **Double-stop safety:** If the recorder is already inactive, return the last known `{ audioBlob, duration }`.
- **Post-stop processing:** When a new blob arrives, create a temporary "Processing..." transaction and run:
  1) `/api/sarvam` for STT
  2) `/api/gemini` for JSON parsing
  3) updates the transaction in IndexedDB
- **Empty blob:** If no audio blob is captured, show "No audio captured" and offer typing instead.
- **Cancellation filter:** If STT text is empty or common filler ("okay." / "yes." / "no, i don't want it."), delete the temp transaction and stop.

## Guidelines (Follow These Rules)

### Reliability & UX Rules

- **Tune RMS threshold (0.02):** Raise it in noisy environments; lower it for soft speakers.
- **Tune silence window (0.6s):** Shorten for faster stop; lengthen to avoid cutting off phrases.
- **Keep tap-to-stop:** Always allow manual override.
- **Block short blobs:** Enforce minimum duration/size before sending to STT.

### Recorder & Stream Handling Rules

- **Handle mimeType quirks:** Some browsers return empty/unsupported mime types; default to `"audio/webm"`.
- **Handle permission errors:** Show a clear error and stop.
- **Do cleanup only on unmount or explicit stop:** Cleanup on state changes ends streams immediately.
- **Route all stops through `stopRecording()`:** Avoid hidden cleanup paths that bypass recorder events.
- **Preserve blobs on inactive stop:** If the recorder is inactive, return the last blob instead of `null`.
- **Clear timeouts on stop:** Clear the hard-timeout inside `recorder.onstop` to avoid late stop calls.
- **Sync state on stop:** Set `isRecording = false` inside `recorder.onstop` so downstream effects can process the blob.

## Tunable Variables (Current Defaults)

Edit `src/config/mic.ts` to change these values.

- **Silence RMS threshold:** `0.02` (below this is treated as silence)
- **Silence duration:** `0.6s` (continuous silence needed before auto-stop)
- **Sampling interval:** `0.2s` (how often RMS is checked)
- **Hard timeout:** `8s` (absolute maximum recording length)

### 1) Silence RMS threshold

  Typical range: 0.015 – 0.03
  Common starting point: 0.02

  - Low threshold → stops too late in noisy areas
  - High threshold → stops too early for soft speakers

### 2) Silence duration

  Typical range: 0.5 – 0.9 seconds
  Common starting point: 0.6 – 0.7 seconds

  - Short → aggressive, can cut off trailing words
  - Long → feels slow / laggy

### 3) Sampling interval

  Typical range: 0.1 – 0.25 seconds
  Common starting point: 0.2 seconds

  - Faster → more responsive, more CPU
  - Slower → cheaper, but may feel delayed

### 4) Hard timeout

  Typical range: 6 – 12 seconds
  Common starting point: 8 seconds

  - Short → may truncate long entries
  - Long → users may forget it’s recording, adds cost
