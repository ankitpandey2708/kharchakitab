import { CATEGORY_LIST } from "@/src/config/categories";
import { PAYMENT_OPTIONS } from "@/src/config/payments";
import { RECURRING_TEMPLATES } from "@/src/config/recurring";
import type { CurrencyCode } from "@/src/utils/money";

const CATS = CATEGORY_LIST.map((c) => `"${c}"`).join("|");
const PAYS = PAYMENT_OPTIONS.filter((o) => o.key !== "unknown")
  .map((o) => `"${o.key}"`)
  .join("|");
const TEMPLATE_IDS = RECURRING_TEMPLATES.map((t) => `"${t.id}"`).join("|");

const jsonSchema = (currencyCode: CurrencyCode) =>
  `{amount:number(${currencyCode}),item:string(2-4words),category:${CATS},date:"YYYY-MM-DD",paymentMethod:${PAYS}(default"cash"),confidence:0-1,recurring:boolean(default false),frequency:"monthly"|"quarterly"|"yearly"(only if recurring),templateId:${TEMPLATE_IDS}|null(match if recurring)}`;

export const getSystemPrompt = (currencyCode: CurrencyCode = "INR") =>
  `Extract expense JSON from transcribed text.
Output schema: ${jsonSchema(currencyCode)}

Rules:
- Item: concise noun only, exclude verbs (e.g. "ate pasta" -> "Pasta")
- Category must be one of: [${CATEGORY_LIST.join(",")}]
- Ambiguous items: closest category, confidence < 0.6
- Date: today unless stated, YYYY-MM-DD
- If text implies recurring/subscription/EMI/monthly/quarterly/yearly, set recurring:true and frequency
- If recurring:true and item matches a known template, set templateId to matching id; otherwise null
- Default recurring:false
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
