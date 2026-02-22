export const ERROR_MESSAGES = {
  amountGreaterThanZero: "Amount must be greater than 0.",
  noAudioCaptured: "No audio captured. Hold the mic and try again.",
  recordingTooShort: "Recording too short. Please speak for at least 1 second.",
  unableToTranscribeAudio: "Unable to transcribe audio.",
  unableToProcessReceipt: "Unable to process receipt.",
  unableToReadReceiptImage: "Unable to read receipt image.",
  unableToConvertHeicImage: "Unable to convert HEIC image.",
  heicImageCouldNotBeProcessed:
    "This HEIC image could not be processed. Try sharing a screenshot or JPEG.",
  sarvamTranscriptionFailed: "Sarvam transcription failed.",
  geminiFlashRequestFailed: "Gemini Flash request failed.",
  failedToParseGeminiResponseJson: "Failed to parse Gemini response JSON.",
  geminiResponseDidNotMatchSchema: "Gemini response did not match schema.",
  receiptParsingFailed: "Receipt parsing failed.",
  failedToParseReceiptJson: "Failed to parse receipt JSON.",
  receiptResponseDidNotMatchSchema: "Receipt response did not match schema.",
  useAppContextMustBeWithinProvider:
    "useAppContext must be used within AppProvider",
} as const;

export const toUserMessage = (
  error: unknown,
  fallbackKey: keyof typeof ERROR_MESSAGES
): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return ERROR_MESSAGES[fallbackKey];
};
