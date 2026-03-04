import { CATEGORY_LIST } from "@/src/config/categories";
import { PAYMENT_OPTIONS } from "@/src/config/payments";
import type { CurrencyCode } from "@/src/utils/money";

const CATS = CATEGORY_LIST.map((c) => `"${c}"`).join("|");
const PAYS = PAYMENT_OPTIONS.filter((o) => o.key !== "unknown")
  .map((o) => `"${o.key}"`)
  .join("|");

const jsonSchema = (currencyCode: CurrencyCode) =>
  `{amount:number(${currencyCode}),item:string(2-4words),category:${CATS},date:"YYYY-MM-DD",paymentMethod:${PAYS}(default"cash"),confidence:0-1}`;

export const getSystemPrompt = (currencyCode: CurrencyCode = "INR") =>
  `Extract expense JSON from transcribed text.
Output schema: ${jsonSchema(currencyCode)}

Rules:
- Item: concise noun only, exclude verbs (e.g. "ate pasta" -> "Pasta")
- Category must be one of: [${CATEGORY_LIST.join(",")}]
- Ambiguous items: closest category, confidence < 0.6
- Date: today unless stated, YYYY-MM-DD
- Valid JSON only. No markdown.`;

export const getReceiptPrompt = (currencyCode: CurrencyCode = "INR") =>
  `Extract structured JSON from receipt image.
Output schema: ${jsonSchema(currencyCode)}

Rules:
- amount = final payable total
- Item = store name or "Receipt"
- Category must be one of: [${CATEGORY_LIST.join(",")}]
- Ambiguous items: closest category, confidence < 0.6
- Date: today unless visible on receipt, YYYY-MM-DD
- Valid JSON only. No markdown.`;
