Custom alerts


# Crazy Ideas (Viral Hooks)

## Funnel: Multiplayer (Acquisition) → Growth (Activation) → Delight (Engagement) → Retention (Habit) → Monetizable user

## A. Retention — "Why I open the app daily" (solo, habitual)

### "Kal Ka Tu" (Tomorrow's You)
Your future self sends a morning message. Parasocial relationship with your own wallet.
- **Trigger:** Daily, on app open (or push notification if alerts enabled)
- **Input:** Yesterday's transactions from IndexedDB (query by timestamp >= yesterday 00:00)
- **Engine:** Gemini Flash API call with structured prompt. Send: array of {item, amount, category, paymentMethod} + user's city. Ask for: Hinglish message from "future you", max 2 sentences, tone = brutally honest but affectionate.
- **Output types:** (1) Roasts: "Bhai kal 3 baar chai pi, aaj coffee mat lena please" (2) Pattern detection: "Har Saturday Swiggy pe ₹800-1200. Main future se bol raha hun — aaj bhi hoga." (3) Praise on low-spend days: "Zero spend yesterday. I love you."
- **UI:** WhatsApp-style chat bubble at top of Summary view, above transaction list. Dismissible. Shows timestamp "Kal Ka Tu • 9:00 AM".
- **Storage:** Cache today's message in localStorage (key: `kk_kalKaTu_{date}`). Don't re-generate on subsequent opens same day.
- **Edge cases:** No transactions yesterday = "Kal kuch nahi kharch kiya. Zinda toh hai na?" First-time user with no data = skip, don't show.
- **Cost:** 1 Gemini Flash call/day/user. Same model as existing expense parsing.

### "Snap Streak"
Consecutive days of logging at least one expense. Like Snapchat streaks for financial discipline.
- **Trigger:** On app open, check if user logged any transaction yesterday
- **Storage:** localStorage keys: `kk_streak_count` (number), `kk_streak_last_date` (YYYY-MM-DD)
- **Logic:** On open, compare today vs `kk_streak_last_date`. If yesterday = increment count. If today = no change. If older = reset to 0 with burn animation.
- **UI:** Small flame icon + count next to date in header (e.g., "🔥 12"). On streak break: flame icon shatters/burns with framer-motion animation, count resets to 0.
- **Milestones:** 7 days = bronze flame, 30 days = silver, 100 days = gold. Color change on the streak icon.
- **No server needed.** Pure client-side localStorage + IndexedDB timestamp check.

## B. Delight — "Why I enjoy logging expenses" (per-transaction, in-the-moment)

### "Kharcha Catchphrase"
AI-generated witty one-liner that appears as a toast immediately after logging a transaction.
- **Trigger:** After successful addTransaction() in page.tsx (both voice and manual entry)
- **Input:** Single transaction {item, amount, category, paymentMethod}
- **Engine:** Gemini Flash call. Prompt: "Generate a witty Hinglish one-liner reacting to this expense. Max 10 words. Tone: funny, relatable, Indian." Return plain string.
- **UI:** Framer-motion toast/snackbar at bottom of screen, auto-dismiss after 3 seconds. Subtle slide-up animation. Text in kk-ash color, not loud.
- **Examples:** ₹250 Zomato → "Pet toh bhar gaya, wallet khaali." ₹15,000 Rent → "Landlord ka EMI chal raha hai tere se." ₹80 Auto → "Ola cancel hua tha kya?" ₹5 Parking → "Itna toh bhikhari ko dete."
- **Optimization:** Don't block the UI. Fire Gemini call async after transaction is saved. If call fails or times out (2s), skip silently — no toast is better than a delayed toast.
- **Toggle:** Add to SettingsPopover as on/off toggle. localStorage key: `kk_catchphrase_enabled` (default: true).
- **Cost:** 1 Gemini Flash call per transaction. Consider batching or skipping if user logs 5+ transactions rapidly.

<!-- ### "Paise Ki Awaaz" (Sound of Money)
Audio feedback that scales with expense amount. Makes spending visceral and tangible.
- **Trigger:** After successful addTransaction(), play sound based on amount
- **Sound tiers (in user's currency):**
  - ₹1-50 / $1-5: Gentle coin clink (single coin drop)
  - ₹50-500 / $5-20: Cash register cha-ching
  - ₹500-2000 / $20-50: Paper money flutter/counting sound
  - ₹2000-5000 / $50-100: ATM withdrawal beep sequence
  - ₹5000+ / $100+: Dramatic Bollywood "dhan-ta-nan" with optional screen shake (navigator.vibrate)
- **Implementation:** Pre-load 5 small audio files (MP3, <50KB each) in /public/sounds/. Use Web Audio API for low-latency playback. Preload on app mount.
- **Screen shake:** For ₹5000+ tier, use framer-motion animate on the main content div: `x: [0, -4, 4, -2, 2, 0]` over 400ms.
- **Toggle:** Add to SettingsPopover as on/off toggle. localStorage key: `kk_sound_enabled` (default: true). Respect device silent mode via AudioContext state check.
- **No server needed.** Static audio assets + client-side logic.
 -->
## C. Growth — "Why I share this app with others" (shareable, outward-facing)

### "Kharcha Wrapped" (Spotify Wrapped for spending)
End of month/week shareable story-format cards with stats and a vibe-based headline.
- **Trigger:** Button in settings OR auto-prompt on first open after month ends
- **Input:** All transactions for the period from IndexedDB. Aggregate: total spend, category breakdown, daily average, top category, transaction count, most expensive day, streak data.
- **Engine:** Two-step: (1) Client-side aggregation of stats. (2) Gemini Flash call for editorial copy — send aggregated stats, get back: vibe headline ("Late Night Cravings & Regret"), 3-4 witty stat comparisons ("You ordered food 14 times. That's more than you called your mom."), spending personality label.
- **UI:** Full-screen story card stack (like Instagram stories). Swipe/tap to advance. 4-5 cards: (1) Vibe headline + album cover art (2) Top category breakdown (3) Funniest stat (4) Spending personality (5) "Share" CTA.
- **Card design:** Use Ink & Ember design system. Background gradient, bold typography, the KharchaKitab watermark + URL at bottom.
- **Sharing:** Generate PNG using html2canvas or @vercel/og. Share via Web Share API (navigator.share) with image file. Fallback: download PNG button.
- **Privacy:** All computation client-side. Gemini only sees aggregated stats (category totals, counts), never individual transaction details or items.
- **Storage:** Cache generated wrapped data in localStorage with month key: `kk_wrapped_2026_03`. Don't regenerate if already exists.

### "₹1 Challenge"
Viral social challenge: survive a day spending only ₹1 on non-essentials. Real-time tracking.
- **Trigger:** User activates from settings or a challenge card. Sets challenge for "today" or "tomorrow".
- **Storage:** localStorage keys: `kk_challenge_active` (boolean), `kk_challenge_date` (YYYY-MM-DD), `kk_challenge_limit` (number, default 1), `kk_challenge_type` (string, e.g. "₹1 Day", "₹0 Friday", "₹500 Weekend", "No-UPI Monday").
- **Logic:** On challenge day, query IndexedDB for today's transactions. Filter out recurring/bills (category in [Bills, Housing, Utilities, Insurance, Financial]). Sum discretionary spend. Compare vs limit.
- **UI:** Persistent banner at top of Summary view showing: challenge name, real-time counter ("₹0 / ₹1 spent"), time remaining ("6h 23m left"). Green = on track, ember = close to limit, red = busted.
- **Failure card:** When limit exceeded, generate a shareable card: "₹40 chai at 3:47 PM. You lasted 7 hours." with dramatic animation (banner turns red, shake effect). Screenshot-optimized dimensions (1080x1920 for Instagram stories).
- **Success card:** End of day, generate celebratory shareable card with confetti animation: "Survived ₹1 Challenge 🔥" with streak count if consecutive.
- **Sharing:** Same html2canvas → Web Share API pipeline as Kharcha Wrapped.
- **Seasonal variants:** Configurable challenge types in a dropdown. "₹0 Friday", "₹500 Weekend", "No-UPI Monday" (flags any UPI transaction as failure).

## D. Multiplayer — "Why I bring people onto the app" (social, requires 2+ users)

### "Kitna Diya?" (How Much Did You Pay?)
Price comparison powered by Gemini's world knowledge. "Am I overpaying?"
- **Trigger:** After addTransaction(), probabilistically (~1 in 5 discretionary transactions). Only for categories: Food, Shopping, Entertainment, Health, Travel. Skip: Bills, Housing, Utilities, Insurance, Financial, Subscriptions, Education.
- **Prereq:** User's city must be set. If not set, prompt once: "Which city are you in?" — dropdown of top 30 Indian cities. Stored in localStorage key: `kk_user_city`.
- **Engine:** Gemini Flash call. Prompt: "What's the typical price range for {item} in {city}, India? Return JSON: {low: number, high: number, reaction: string}. Reaction = witty Hinglish one-liner if overpaying or underpaying. Max 12 words."
- **UI:** Subtle toast below the transaction card, styled differently from Kharcha Catchphrase (softer, info-toned). "Pune mein ₹150-300 chalta hai. Baal sone ke hain kya?" Auto-dismiss after 4 seconds.
- **Caching:** localStorage key pattern: `kk_price_{city}_{item_normalized}`. TTL: 30 days. Normalize item to lowercase, trim whitespace. This prevents repeated API calls for same item+city.
- **Cost control:** Max 3 Kitna Diya calls per day per user. Track in localStorage: `kk_kitna_diya_count_{date}`.
- **Interaction with Kharcha Catchphrase:** If both are enabled, Kitna Diya takes priority when it triggers (don't show both toasts). On non-Kitna-Diya transactions, Catchphrase shows instead.
- **Future:** At 10k+ MAU, supplement Gemini ranges with anonymized PostHog aggregates (category + city + amount bucket) for real crowd-sourced data.

# Pricing
1. cap on voice based entry
2. if MAU=1000 , then show Ads to free user.
3. RAG chat on insights
4. household.
