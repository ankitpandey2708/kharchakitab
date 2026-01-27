import { ExpenseSchema, type Expense } from "@/src/utils/schemas";
import { ERROR_MESSAGES } from "@/src/utils/error";

const formatDateYMD = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseJsonSafely = (rawText: string): unknown => {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(rawText.slice(start, end + 1));
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
};

export const parseReceiptWithGemini = async (image: Blob): Promise<Expense> => {
  const fileName = (() => {
    const type = image.type;
    if (type === "image/png") return "receipt.png";
    if (type === "image/webp") return "receipt.webp";
    if (type === "image/heic") return "receipt.heic";
    if (type === "image/heif") return "receipt.heif";
    return "receipt.jpg";
  })();
  const response = await fetch("/api/receipt", {
    method: "POST",
    body: (() => {
      const formData = new FormData();
      formData.append("image", image, fileName);
      return formData;
    })(),
  });

  if (!response.ok) {
    throw new Error(ERROR_MESSAGES.receiptParsingFailed);
  }

  const data = (await response.json()) as { text?: string };
  const rawText = data.text ?? "{}";
  const parsed = parseJsonSafely(rawText);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(ERROR_MESSAGES.failedToParseReceiptJson);
  }

  const today = formatDateYMD(new Date());
  if (!("date" in parsed)) {
    (parsed as { date?: string }).date = today;
  }

  const result = ExpenseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(ERROR_MESSAGES.receiptResponseDidNotMatchSchema);
  }
  return result.data;
};
