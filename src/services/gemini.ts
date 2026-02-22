import { ExpenseSchema, type Expense } from "@/src/utils/schemas";
import { SYSTEM_PROMPT } from "@/src/utils/prompts";
import { ERROR_MESSAGES } from "@/src/utils/error";
import { formatDateYMD } from "@/src/utils/dates";

export const parseWithGeminiFlash = async (text: string): Promise<Expense> => {
  const today = formatDateYMD(new Date());
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: `${SYSTEM_PROMPT}\nToday: ${today}\nInput: ${text}`,
    }),
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.geminiFlashRequestFailed);
  }

  const data = (await response.json()) as { text?: string };
  const rawText = data.text ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    throw new Error(ERROR_MESSAGES.failedToParseGeminiResponseJson);
  }

  if (parsed && typeof parsed === "object" && !("date" in parsed)) {
    (parsed as { date?: string }).date = today;
  }

  const result = ExpenseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(ERROR_MESSAGES.geminiResponseDidNotMatchSchema);
  }
  return result.data;
};
