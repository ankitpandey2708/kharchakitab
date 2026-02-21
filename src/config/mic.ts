export const MIC_CONFIG = {
  silenceThreshold: 0.02,
  silenceDurationMs: 600,
  sampleIntervalMs: 200,
  hardTimeoutMs: 8000,
} as const;

export const MIN_AUDIO_DURATION_MS = 500;
export const MIN_AUDIO_SIZE_BYTES = 1000;
export const DISMISS_TRANSCRIPTS = new Set([
  "no, i don't want it.",
  "okay.",
  "yes.",
  "okay, i will do it.",
  "",
]);
