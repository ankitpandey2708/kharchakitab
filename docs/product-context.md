# KharchaKitab: Business & Product Documentation

---

## 1. PROBLEM & SOLUTION

**User Pain Point**

Most expense tracking apps require typing, scrolling through categories, or clicking multiple fields per transaction. For Indian users who think and speak in Hinglish (Hindi-English mix) and earn/spend in rupees, this friction is compounded by UI designed for Western users. The result: people abandon expense tracking because logging 10 daily transactions takes 5+ minutes of friction.

**Our Solution Approach**

KharchaKitab is a Hinglish-first voice expense tracker that lets users log expenses by simply speaking: "chai 20 rupees," "Netflix 499," or "maid 5000" — and it categorizes, timestamps, and stores the entry instantly. Three input methods:

1. **Voice Input (Primary)** — Speech-to-text via Sarvam (supports Hinglish, Hindi, English), then AI parsing (Gemini Flash) to extract amount, item, category, and payment method as structured JSON
2. **Manual Entry + Bulk Paste** — Type or paste multiple expenses at once, with AI helping parse unstructured input

**Business Impact**

- **Retention** — Streak mechanic (consecutive days of logging) gamifies usage and reduces churn; daily reminder notifications ensure habit formation
- **Engagement** — Personalized "Apni Awaaz" messages referencing specific items ("Chai x3 ₹300") and patterns drive higher open rates vs. generic advice
- **Differentiation** — Only expense tracker optimized for Hinglish speakers; language + culturally relevant categories (maid, dhobi, LPG gas) + Indian payment methods (UPI, cash) create defensible moat

---

## 2. USERS & JOBS-TO-BE-DONE

**Primary Persona: "Quick Spender"**

- Age: 20–45, Indian urban middle-class (earns ₹25K–₹100K/month)
- Tech comfort: Medium-high; uses UPI, online payments, but prefers voice over typing
- Pain: 10–15 daily transactions (food, travel, utilities, subscriptions); currently uses WhatsApp notes or Google Sheets — not sustainable
- Frequency: 2–5 min sessions, 5–10 times/day (voice input per transaction)
- Success: Logs 100% of daily spend in <10 seconds per entry; understands spending patterns by category

**Secondary Persona: "Household Budget Holder"**

- Situation: Married/living with family; wants to sync expenses with spouse across devices
- Pain: Spouse spends on groceries/utilities but entries don't sync; current ledger (paper/Sheets) requires daily manual work
- Success: Unified family view of spending; clear breakdown of who spent what; can set shared monthly budget

**Core Workflows**

| Job to Be Done | Flow | Success Criteria |
|---|---|---|
| Log daily expense | Voice: "chai 20" → transcribe → parse → confirm → save | <15 sec end-to-end; correct category 90% of time |
| Understand spending | View analytics: category breakdown, trends, top items, daily average | Can answer "How much on food this week?" in <10 sec |
| Set & track budget | Set monthly budget → app shows % used, warns at 80%/100% | Real-time budget vs. actual feedback; visual ring chart |
| Sync with partner | Pair via QR/4-digit code → background sync every minute | Partner sees my expenses within 5 sec of me logging |
| Manage recurring expenses | Create template for Netflix/rent → auto-trigger monthly reminder → one-tap log | Recurring items logged without re-typing amount/category |
| Get spending insights | Daily/weekly Apni Awaaz message teasing specific patterns | Memorable, specific to my data, motivates behavior change |

---

## 3. CAPABILITIES & BOUNDARIES

**Core Features (Live)**

| Feature | Acceptance Criteria |
|---|---|
| Voice-to-Expense Input | Speak in Hindi/English/Hinglish; <2s transcription (Sarvam); <500ms AI parsing; handles ambiguous input ("50" alone → prompt for item) |
| Receipt Scanning | Upload/photograph receipt (PNG/JPG/WebP/HEIC); Gemini Vision extracts items + total; user can edit before save |
| Expense Categories | 15 categories (Food, Travel, Fuel, Shopping, Bills, Housing, Utilities, Subscriptions, Insurance, Financial, Home Services, Education, Health, Entertainment, Other); AI maps to nearest with confidence score |
| Payment Methods | Cash, UPI, Card, Unknown; defaults to Cash if not specified |
| Manual & Bulk Entry | Type/paste expenses; AI parses and suggests categories; bulk preview shows all items before save |
| Analytics Dashboard | Month/today/custom date views; category breakdown (pie/bar), trends (daily line chart vs. prev month/avg), top items, daily spend breakdown; owner filter (me/partner/all) |
| Transaction History | Paginated list (30/page); search by name/date; show owner device, payment method, timestamp; soft-delete |
| Recurring Expense Manager | Create/edit/delete recurring templates (monthly/quarterly/yearly); 60+ pre-built templates; set reminder days before due; auto-log on due date |
| Household Pairing | 4-digit code + QR → ECDSA key exchange → AES-256 encrypted P2P sync; chunks of 200 transactions |
| Budget Management | Personal + household monthly budgets; ring chart + warning at 80%/100%; synced across paired devices |
| Notifications | Daily reminder (configurable time), recurring bill alerts, Apni Awaaz nudges |
| Apni Awaaz (AI Insights) | Daily Hinglish message analyzing yesterday's spend; types: roast, pattern, praise, warning, streak; generated via Gemini/OpenRouter |
| Offline-First PWA | Works offline via IndexedDB; syncs on reconnect; installable on home screen |

---

## 4. CRITICAL USER FLOWS

**Happy Path: Voice Log → Confirm → Save**

1. Tap microphone button (bottom center)
2. App starts recording audio (real-time waveform shown)
3. User speaks: "chai 20 rupees" (or just "chai 20" or "20 rupees")
4. Release mic; Sarvam transcribes (handles Hinglish, auto-translates to English)
5. Gemini Flash parses: `{ amount: 20, item: "Chai", category: "Food", paymentMethod: "cash", date: today }`
6. App shows: item + amount + category icon (user can tap to edit if wrong)
7. User hits save → transaction stored, streak updated, sound plays
8. Home screen total updates immediately; if threshold hit, Apni Awaaz queued for tomorrow


**Household Sync Flow**

1. Device A taps "Pair with family" → generates QR code + 4-digit code
2. Device B scans QR or enters code manually
3. Both devices exchange ECDSA public keys via presence server
4. Shared AES session key derived; P2P WebRTC data channel established
5. Device A sends: pending transactions (chunks of 200) + household budget
6. Device B receives, validates, merges into IndexedDB; sends back its pending transactions
7. Future syncs: on-demand or every minute in background; resume from chunk index on disconnect

**Access Control**

| Action | Rule |
|---|---|
| View own transactions | Always allowed |
| View partner's transactions | Only if paired AND `is_private = false` |
| Edit transactions | Own only; cannot edit owner field |
| Delete transactions | Soft-delete (marked `deleted_at`; syncs deletion to partner) |
| Set household budget | Either user; last-write-wins on `updated_at` |
| Break pairing | Either device; optionally clears partner's transactions from local DB |

---

## 5. DEPENDENCIES & CONSTRAINTS

**External APIs**

| Service | Purpose | Rate Limit | Fallback |
|---|---|---|---|
| Sarvam AI | Speech-to-text (Hinglish/Hindi/English → English) | 6 requests/min per IP | Manual entry |
| Gemini Flash (Google) | Parse text → expense JSON; receipt OCR | Tier-dependent | OpenRouter (Gemma-3-27B-IT free) |
| OpenRouter | Fallback LLM if Gemini fails | Free tier | Manual entry required |
| Upstash Redis | Rate limiting per IP | — | Skip if unavailable |
| Presence Server (WebSocket, Render) | Device discovery for pairing | 2 connections/device | Manual code entry bypasses it |
| TURN Servers | Relay for P2P WebRTC through NAT | Upstash TURN credentials | Falls back to direct P2P or presence server |
| PostHog | Event tracking | — | Currently disabled (`POSTHOG_ENABLED=false`) |

**Data Persistence**

- **IndexedDB (QuickLogDB v5)** — Local-first; schema: transactions, transaction_versions, device_identity, pairings, sync_state, recurring_templates, recurring_alerts
- **localStorage** — Budgets, currency, UI state, streak counter, dismissed tips, settings
- **Sync Chunking** — 200 transactions/chunk with AES-256 + gzip; cursor tracks `last_sync_at` per partner (incremental sync only)

**Key Constraints**

| Constraint | Impact | Mitigation |
|---|---|---|
| No backend database (fully client-side) | Data lost on browser clear; no cross-device unless paired | Cloud backup planned; pairing ensures redundancy |
| Sarvam rate limit (6 req/min/IP) | Hits ceiling with power users | Exponential backoff; manual entry fallback |
| Browser permissions required (mic, camera, notifications) | Users may deny; core features break | Graceful fallback; permission hints in onboarding |
| HEIC image support | iOS defaults to HEIC format | `heic2any` library; fails to "re-upload as JPEG" |
| No user accounts | No cloud backup; no recovery if device lost | Pairing provides second copy; export planned |

---

## 6. PRODUCT DECISIONS LOG

| Decision Point | Choice Made | Rationale | Trade-off |
|---|---|---|---|
| Voice vs. manual as primary | Voice (Sarvam + Gemini) as 1st-class; manual as fallback | Voice reduces entry time by ~80% for Hinglish speakers | Depends on API availability |
| Hinglish-first vs. multi-language | Hinglish only; Sarvam translates Hindi/English to English | Indian urban market speaks Hinglish; UI + Apni Awaaz in Hinglish | Excludes Hindi-only speakers; no Tamil/Gujarati/Marathi |
| Client-side only (no backend) | All data in IndexedDB; P2P sync; no cloud backup | No server costs; privacy-first; faster iteration | Data loss risk on device reset; complex sync logic |
| Household pairing (2-device max) | Max 2 devices per pairing; no group sharing | Typical household: 2 people; simpler UX; easier conflict resolution | Excludes roommates/group houses |
| ECDSA + AES-256 encryption in P2P sync | Key exchange via ECDSA; payload via AES-256-CBC | Presence server never sees expense data; user retains control | Added complexity; no cloud recovery path |
| Soft-delete (not hard-delete) | Transactions marked `deleted_at`, not removed | Allows undo; ensures partner can sync deletions; audit trail | Soft-deletes accumulate; not true privacy deletion |
| Chunked sync (200 tx/chunk) | Transactions sent in chunks with progress indicator | Handles 10k+ transaction users; prevents timeout/memory overload | Added latency (multiple round-trips) |
| Analytics as slide-in overlay (not tab) | AnalyticsView opens as overlay; home visible behind | Faster context-switching; can compare home + analytics | iOS Safari issues with fixed overlays |
| Recurring templates (60+ presets) | Pre-built templates for insurance, subscriptions, utilities | Reduces friction for common expenses; amount + frequency pre-filled | UI complexity; templates need maintenance |
| Streaks + Apni Awaaz gamification | Consecutive-day streak counter + daily AI nudges | Drives habit formation; core retention lever | Could feel gimmicky if insight quality is low |

---
