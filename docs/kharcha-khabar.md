aka "apni-awaaz"

A daily message from your inner financial conscience about yesterday's spending. Builds a parasocial accountability loop — you're not being judged by an app, you're being judged by *your own voice*.

**Why it works:**
- Temporal self-continuity research (Hershfield et al.) shows people who feel connected to their future self make better financial decisions.
- Hinglish tone makes it feel like an inner voice, not a corporate notification. Low cringe threshold = high screenshot potential.
- One message per day = scarce, anticipated, ritualistic. Not a feed, not a dashboard — a single voice note from your conscience.

---

**Trigger & Scheduling:**
- Hooks into existing `dailyReminder` infrastructure (`scheduleDailyReminder` in `notifications/dailyReminder.ts`).
- New periodic sync tag: `apni-awaaz` alongside existing `daily-reminder`.
- Default delivery: **9:00 AM local time** (morning = reflective mindset, before the day's spending begins).
- Gated behind: `kk_notifications_master` AND new toggle `kk_apni_awaaz_enabled` (default: true for existing users with notifications on).
- Feature toggle via `createFeatureToggle("kk_apni_awaaz_enabled", true)`. Toggle lives in SettingsPopover under "Daily Insights" section.

**Data Pipeline:**
- Query IndexedDB `transactions` store using `by-date` index: all transactions where `timestamp >= yesterday 00:00` AND `timestamp < today 00:00` AND `deleted_at === null`.
- Client-side aggregation before any API call (privacy-first). Full `DayStats` object built locally:
  ```
  {
    totalSpend, txCount, categories, topCategory,
    paymentMethodBreakdown, dayOfWeek, isWeekend,
    items: ItemBreakdown[],       // grouped by name, sorted by amount desc
    topItem: ItemBreakdown|null,  // items[0]
    frequentItems: string[],      // item names with count >= 2
    hasMultipleSameItem: boolean
  }
  ```
- Also query last 7 days and last 30 days for `recentContext` (week totals, month daily avg, streak).

**Payload sent to Gemini (minimal — only what the model needs to write 2 sentences):**
```json
{
  "yesterday": {
    "items": [{ "name": "Cigarette", "amount": 100000, "count": 1 }, ...],
    "totalSpend": 100300,
    "isWeekend": false
  },
  "weekTotal": 100300,
  "dailyAvg": 3343,
  "streakDays": 3        // only included when type === "streak"
}
```
Redundant fields excluded from payload: `topItem` (= items[0]), `hasMultipleSameItem`, `frequentItems`, `topCategory`, `txCount`, `category` per item.

**Gemini Prompt:**
- Route: `/api/gemini` with `type: "apni-awaaz"`.
- Models: `gemini-3.1-flash-lite-preview` → `gemma-3-27b-it` → OpenRouter fallback.
- Type instruction injected per-request as `Tone goal:` — model only sees the one relevant type, not all 5.
- Prompt (see `src/utils/prompts.ts → getApniAwaazPrompt`):
  ```
  Hinglish (Hindi-English mix) inner voice reacting to user's spending data.
  Brutally honest but affectionate tone.

  Rules:
  - Max 2 sentences. End with a concrete micro-action.
  - Reference specific item names. If count>1, use "ItemName xCount (₹amount)" format.
  - No generic advice. Be specific to their data.
  - Tone goal: {typeInstruction}

  Example: ...
  Valid JSON only. Schema: {"message":"string","emoji":"single emoji"}
  ```
- **Type is NOT in the output schema.** The model only generates `message` + `emoji`. Type is always the one selected deterministically client-side and never overridden by the model.
- Gemma 3 lacks native JSON mode — `tryParseJSON()` in `route.ts` handles markdown fences and extracts JSON from surrounding text before parsing.

**Message taxonomy (5 types):**

| Type | Trigger condition | Example |
|------|------------------|---------|
| **Roast** | Single category > 40% of daily spend AND txCount > 2 | "Bhai kal 3 baar Food pe gaye. Ghar pe kitchen hai ya showpiece?" |
| **Pattern** | Same category appears 4+ times in last 7 days OR weekend spend > 2x weekday avg | "Har Saturday Swiggy pe ₹800-1200. Main andar se bol raha hun — aaj bhi hoga." |
| **Praise** | totalSpend < 30-day daily average × 0.5 OR zero spend day | "Kal sirf ₹120 kharch. Teri apni awaaz bol rahi hai — proud hu. Aaj bhi aise hi." |
| **Warning** | 7-day rolling total > last month's weekly average × 1.3 | "Is hafte ₹14,000 ho gaye. Pichle mahine poora hafta ₹9,000 tha. Samajh ja." |
| **Streak** | 3+ consecutive days below daily average | "3 din se average se neeche. Streak mat tod — teri awaaz dekh rahi hai." |

- Type selection is deterministic (client-side, based on thresholds above). Gemini only writes the copy for the selected type.
- If multiple types qualify, priority order: streak > warning > pattern > roast > praise.

**Storage:**

| Key | Purpose | Lifetime |
|-----|---------|----------|
| `kk_apni_awaaz_enabled` | User preference toggle | Forever (user setting) |
| `kk_apniAwaaz_{YYYY-MM-DD}` | Today's message + all ephemeral state | Auto-cleaned after 7 days |

The dated key stores everything: `{ message, type, emoji, stats, generatedAt, dismissed }`.
- **Cache:** key exists → render from it, no API call.
- **Dismiss:** set `dismissed: true` on the object, write back.
- **Scheduler dedup:** key exists → already generated today, don't fire again. No separate `_scheduled` key.
- **Cleanup:** on app mount, delete any `kk_apniAwaaz_*` key where the date suffix is older than 7 days.
- If API call fails → fallback to a deterministic client-side message based on type (no Gemini needed). Fallbacks are **not cached** — next online open retries.
  - Roast fallback: "Kal {topCategory} pe ₹{amount} gaye. Aaj soch ke kharcha kar."
  - Praise fallback: "Kal ka spend: ₹{total}. Below average. Keep it up."

**Edge cases:**
- No transactions yesterday → "Kal kuch nahi kharch kiya. Ya toh saint hai, ya bhool gaya add karna."
- First transaction ever → "Pehla transaction! Ab roz yahan aaoge. 👋" (welcome message)
- Day 2+ → Shows actual roast/praise about yesterday's spending (no minimum data requirement)
- Paired/household mode → only analyze transactions where `owner_device_id` matches current device (don't roast someone for their partner's spending).
- Private transactions (`is_private: true`) → excluded from aggregation. Apni Awaaz respects secrets.
- Amortized/recurring transactions → excluded. Only count active, deliberate spending.