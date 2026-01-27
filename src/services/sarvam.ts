import { ERROR_MESSAGES } from "@/src/utils/error";

export const transcribeAudio = async (blob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append("file", blob, "audio.webm");

  const response = await fetch("/api/sarvam", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.sarvamTranscriptionFailed);
  }

  const data = (await response.json()) as { text?: string };
  return data.text || "";
};
