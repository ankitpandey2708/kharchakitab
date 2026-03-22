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
  `Extract expense JSON array from transcribed text. Always return a JSON array, even for a single expense.
Output schema: Array<${jsonSchema(currencyCode)}>

Rules:
- Split into separate objects if input contains multiple distinct expenses (e.g. "chai 50 samosa 100" → 2 items; "chai and samosa 350" → 1 item)
- Item: concise noun only, exclude verbs (e.g. "ate pasta" -> "Pasta")
- Category must be one of: [${CATEGORY_LIST.join(",")}]
- Ambiguous items: closest category, confidence < 0.6
- Date: today unless stated, YYYY-MM-DD
- If text implies recurring/subscription/EMI/monthly/quarterly/yearly, set recurring:true and frequency
- If recurring:true and item matches a known template, set templateId to matching id; otherwise null
- Default recurring:false
- Valid JSON array only. No markdown.`;

export const MANN_KI_BAAT_TYPE_INSTRUCTIONS: Record<string, string> = {
  roast: "Tease about specific items/categories they over-spent on",
  pattern: "Call out repeated items or category patterns across days",
  praise: "Celebrate a low-spend day genuinely",
  warning: "Flag a concerning weekly trend",
  streak: "Encourage continuing a low-spend streak",
};

export const getMannKiBaatPrompt = (typeInstruction: string) =>
  `Hinglish (Hindi-English mix) inner voice reacting to user's spending data. Brutally honest but affectionate tone.

Rules:
- Max 2 sentences. End with a concrete micro-action (skip X, cook instead of order, etc.)
- Reference specific item names from data. If count>1, use "ItemName xCount (₹amount)" format.
- No generic advice ("save more"). Be specific to their data.
- Tone goal: ${typeInstruction}

Example:
Input: {"yesterday":{"items":[{"name":"Chai","amount":300,"count":3},{"name":"Cigarette","amount":1000,"count":1}],"totalSpend":1300}}
Output: {"message":"Chai x3 (₹300) + Cigarette ₹1000. Aaj ghar pe raho, bachat hogi. 😤","emoji":"😤"}

Valid JSON only. Schema: {"message":"string","emoji":"single emoji"}`;

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
