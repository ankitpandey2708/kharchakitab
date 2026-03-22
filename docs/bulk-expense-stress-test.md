# Gemini Multi-Expense Parsing — Stress Test Results

**Model:** `models/gemini-3.1-flash-lite-preview`
**Test date:** 2026-03-16
**Script:** `scripts/stress-test-gemini-v2.mjs`

---

## Summary

| # | Case | Count | Type | Status |
|---|---|---|---|---|
| 1 | Relative date | 1 | Non-recurring | ✅ Pass |
| 2 | Mixed payment methods | 2 | Non-recurring | ✅ Pass |
| 3 | Shared trailing date | 3 | Non-recurring | ❌ Fail |
| 4 | Two recurring, different frequencies | 2 | All recurring | ✅ Pass |
| 5 | 1 recurring + 2 non-recurring | 3 | Mixed | ✅ Pass |
| 6 | 2 recurring + 1 non-recurring | 3 | Mixed | ✅ Pass |
| 7 | Shared explicit date ("all on") + implicit today | 4 | Non-recurring | ✅ Pass |
| 8 | Heavy mix: payments + recurring + relative date | 4 | Mixed | ✅ Pass |

**Result: 7/8 passed**

---

## Case 1 — Single item with relative date

**Input**
```
auto 80 yesterday
```

**Expected:** 1 item, Travel, date = 2026-03-15

**Output**
```
• Auto fare  ₹80  [Travel]  [cash]  date:2026-03-15
```

**Status:** ✅ Pass — "yesterday" resolved correctly to 2026-03-15

---

## Case 2 — Two items, mixed payment methods

**Input**
```
groceries 1200 upi and petrol 500 card
```

**Expected:** 2 items, correct paymentMethods per item

**Output**
```
• Groceries  ₹1200  [Food]  [upi]   date:2026-03-16
• Petrol     ₹500   [Fuel]  [card]  date:2026-03-16
```

**Status:** ✅ Pass — upi/card attributed to correct items independently

---

## Case 3 — Three items, shared trailing date ⚠️

**Input**
```
chai 30, samosa 20, auto 60 on march 10
```

**Expected:** 3 items, all date = 2026-03-10

**Output**
```
• Chai    ₹30  [Food]    [cash]  date:2026-03-16  ← wrong
• Samosa  ₹20  [Food]    [cash]  date:2026-03-16  ← wrong
• Auto    ₹60  [Travel]  [cash]  date:2026-03-10  ✓
```

**Status:** ❌ Fail

**Root cause:** "on march 10" at the end is applied only to the immediately adjacent item (`auto`). Gemini treats it as locally scoped, not globally scoped across all items in the input.

**Contrast with Case 7:** When the user explicitly says `"all on 14th march"`, the word "all" signals global intent and Gemini applies the date correctly to every item.

**Prompt fix needed:** Add rule — *"If a date appears at the end of the input with no item-specific association, apply it to all items."*

---

## Case 4 — Two recurring items, different frequencies

**Input**
```
netflix 499 monthly school fees 5000 quarterly
```

**Expected:** 2 recurring items, monthly + quarterly, correct templateIds

**Output**
```
• Netflix subscription  ₹499   [Subscriptions]  [cash]  date:2026-03-16  | ⟳ monthly  templateId:netflix
• School fees           ₹5000  [Education]      [cash]  date:2026-03-16  | ⟳ quarterly templateId:school-fees
```

**Status:** ✅ Pass — both frequencies and templateIds matched correctly

---

## Case 5 — Three items: 1 recurring + 2 non-recurring

**Input**
```
rent 15000 monthly chai 40 auto 80
```

**Expected:** rent recurring (monthly, templateId:rent), chai + auto non-recurring

**Output**
```
• Rent      ₹15000  [Housing]  [cash]  date:2026-03-16  | ⟳ monthly  templateId:rent
• Chai      ₹40     [Food]     [cash]  date:2026-03-16
• Auto      ₹80     [Travel]   [cash]  date:2026-03-16
```

**Status:** ✅ Pass — recurring flag isolated to rent only, non-recurring items unaffected

---

## Case 6 — Three items: 2 recurring + 1 non-recurring

**Input**
```
doctor visit 800 and gym 2000 monthly and netflix 499 monthly
```

**Expected:** doctor visit non-recurring (Health), gym + netflix recurring

**Output**
```
• Doctor visit       ₹800   [Health]         [cash]  date:2026-03-16
• Gym membership     ₹2000  [Health]         [cash]  date:2026-03-16  | ⟳ monthly  templateId:gym
• Netflix subscription ₹499 [Subscriptions]  [cash]  date:2026-03-16  | ⟳ monthly  templateId:netflix
```

**Status:** ✅ Pass — "monthly" not incorrectly applied to doctor visit

---

## Case 7 — Four items: shared explicit date + one implicit today

**Input**
```
paid 250 for lunch and 90 for auto and 35 for chai all on 14th march, and coffee 40 today
```

**Expected:** lunch + auto + chai → 2026-03-14, coffee → 2026-03-16

**Output**
```
• Lunch     ₹250  [Food]    [cash]  date:2026-03-14
• Auto fare ₹90   [Travel]  [cash]  date:2026-03-14
• Chai      ₹35   [Food]    [cash]  date:2026-03-14
• Coffee    ₹40   [Food]    [cash]  date:2026-03-16
```

**Status:** ✅ Pass — "all on 14th march" correctly scoped to 3 items; "today" correctly defaulted

**Note:** The word "all" is the key signal for global date application. See Case 3 for the failure case when "all" is absent.

---

## Case 8 — Four items: heavy mix (recurring + non-recurring + payments + relative date)

**Input**
```
dinner 600 card, SIP 5000 monthly, health insurance 12000 yearly, medicine 350 upi yesterday
```

**Expected:** dinner (card, non-rec) + SIP (monthly, templateId:sip) + health insurance (yearly, templateId:health-insurance) + medicine (upi, yesterday)

**Output**
```
• Dinner            ₹600    [Food]       [card]  date:2026-03-16
• SIP               ₹5000   [Financial]  [cash]  date:2026-03-16  | ⟳ monthly  templateId:sip
• Health Insurance  ₹12000  [Insurance]  [cash]  date:2026-03-16  | ⟳ yearly   templateId:health-insurance
• Medicine          ₹350    [Health]     [upi]   date:2026-03-15
```

**Status:** ✅ Pass — all attributes correctly isolated per item across all dimensions simultaneously

---

## Known Issues

### Issue 1 — Shared trailing date not globally applied (Case 3)

**Trigger:** User appends a date at the end of a comma/space-separated list without using the word "all"

```
chai 30, samosa 20, auto 60 on march 10   ← only "auto" gets the date
```

**Workaround for users:** Say "all on [date]" or "on [date]" before the list

**Fix:** Add prompt rule — *"If a single date appears at the end of the full input with no item immediately preceding it, apply that date to all items."*

---

## PnC Coverage Matrix

| Dimension | Values tested |
|---|---|
| Item count | 1, 2, 3, 4 |
| Recurring mix | all non-rec / all recurring / 1rec+2non / 2rec+1non |
| Date | implicit today / relative ("yesterday") / explicit ("march 10") / shared ("all on 14th march") / mixed |
| Payment method | default cash / explicit upi / explicit card / mixed per item |
| Input style | space-separated / comma-separated / natural language ("paid X for Y") |
