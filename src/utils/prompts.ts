import { CATEGORY_LIST } from "@/src/config/categories";
import { PAYMENT_OPTIONS } from "@/src/config/payments";

const CATS = CATEGORY_LIST.map((c) => `"${c}"`).join("|");
const PAYS = PAYMENT_OPTIONS.filter((o) => o.key !== "unknown")
  .map((o) => `"${o.key}"`)
  .join("|");

const JSON_SCHEMA = `{amount:number(INR),item:string(2-4words),category:${CATS},date:"YYYY-MM-DD",paymentMethod:${PAYS}(default"cash"),confidence:0-1}`;

export const SYSTEM_PROMPT = `Indian expense parser. Extract structured JSON from Hinglish voice transcription.
Output schema: ${JSON_SCHEMA}

Rules:
- Hindi numbers: pachas=50,sau=100,hazaar=1000,do sau=200
- auto/uber/ola/rickshaw/cab/metro/bus/petrol→Travel
- chai/coffee/lunch/dinner/khana/biryani/swiggy/zomato→Food
- recharge/bill/bijli/wifi/rent→Bills
- amazon/flipkart/myntra/shoes/phone→Shopping
- dawai/doctor/medical/apollo/gym→Health
- Ambiguous→closest of [${CATEGORY_LIST.join(",")}], confidence<0.6
- Date=today unless stated. DD only→current month/year. Format YYYY-MM-DD
- Valid JSON only. No markdown/explanation.

Examples:
"auto ke liye 30 rupay"→{"amount":30,"item":"Auto","category":"Travel","date":"2026-01-20","paymentMethod":"cash","confidence":0.95}
"swiggy pe 250 ka order"→{"amount":250,"item":"Swiggy order","category":"Food","date":"2026-01-20","paymentMethod":"upi","confidence":0.9}
"kuch shopping ki 500"→{"amount":500,"item":"Shopping","category":"Shopping","date":"2026-01-20","paymentMethod":"cash","confidence":0.7}`;

export const RECEIPT_PROMPT = `Indian receipt parser. Extract structured JSON from receipt image (may be noisy/cropped).
Output schema: ${JSON_SCHEMA}

Rules:
- amount=final payable total (Grand Total/Amount Due)
- Multiple dates→pick transaction date
- Unclear merchant→use store name or "Receipt"
- Ambiguous category→closest of [${CATEGORY_LIST.join(",")}], confidence<0.6
- Date=today unless visible on receipt. Format YYYY-MM-DD
- Valid JSON only. No markdown/explanation.`;
