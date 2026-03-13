# Crazy Ideas (Viral Hooks)

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


# Pricing
1. cap on voice based entry
2. if MAU=1000 , then show Ads to free user.
3. RAG chat on insights
4. household.


# todo
1. force delete partner txn
2. SyncMnaager in settingspopeever
3. analyticsview in bottom bar
4. monthly budget and recurring contextual (if stayed within budget show confetti)
5. showcase private vs shared
6. import/export wrt solo|household
7. signalingClient and hosuehold mode behind paywall
8. RecurringView UI revamp to icon based like bharat billpay
9. sync beyond 2 devices possible?
10. add bharat billpay if possible?
11. scan to pay and webhook back to kharchakitab possible?
12. multiple expenses in 1 go

Festival/Event "Buckets"
The Research: Indian financial cycles are heavily punctuated by specific events (Diwali, a sibling's wedding, etc.). These events often require temporary immense pooling of resources.
The Vitamin: Allow the creation of a temporary "Shared Savings Bucket" (e.g., "Goa Trip 2026"). Both users can see progress toward it, separate from regular household bills.

 Instead of exporting a boring Excel sheet on the 1st of the month, generate an Instagram-style "Wrap Up." (e.g., "You went on 4 dates this month! ❤️", "You successfully kept Zomato/Swiggy under ₹2000! 🏆")

  Replace "Who owes whom" with a dynamic pie chart showing contribution vs. agreed-upon household ratio.


*******
await new Promise(r => indexedDB.open("QuickLogDB").onsuccess = e => e.target.result.transaction("transactions").objectStore("transactions").getAll().onsuccess = ev => r(ev.target.result.sort((a, b) => a.timestamp - b.timestamp).map(tx => ({...tx, timestamp: new Date(tx.timestamp).toLocaleDateString("en-IN", {day: "2-digit", month: "short", year: "numeric"})}))));

*******
iOS User Setup (send this to any iOS user)

PART 1 — Install the app (do this first, takes 30 seconds)
1. Open this link in Safari (not Chrome, not Instagram — must be Safari).
2. Tap the Share button (box with arrow icon) at the bottom of Safari.
3. Scroll down → tap “Add to Home Screen” → tap “Add”.
4. Close Safari. Open KharchaKitab from your home screen icon.
5. When asked about notifications → tap Allow (needed for payment reminders).
    - If you tapped Don’t Allow: Settings → KharchaKitab → Notifications → Allow.

PART 2 — Set up receipt scanning via share sheet (optional but useful)
1. Open the Shortcuts app → tap + to create a new shortcut.
2. Tap Add Action → search “Receive Images” → add it.
    - Tap the action’s settings (i) and enable “Show in Share Sheet”.
3. Tap Add Action → search “Get Contents of URL” → add it.
    - URL: https://kharchakitab.vercel.app/api/share/submit
    - Add a field: image = Shortcut Input
4. Tap Add Action → search “Open URLs” → add it.
    - Input should be the result from “Get Contents of URL”.
5. Name the shortcut: KharchaKitab Share → tap Done.
- Now: open any photo/receipt → Share → KharchaKitab Share → app opens with receipt loaded.
