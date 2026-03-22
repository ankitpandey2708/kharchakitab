### Buckets for festivals /trips etc

### "Kharcha Wrapped" (Spotify Wrapped for spending)
 Instead of exporting a boring Excel sheet on the 1st of the month, generate an Instagram-style "Wrap Up." (e.g., "You went on 4 dates this month! ❤️", "You successfully kept Zomato/Swiggy under ₹2000! 🏆")
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
2. RAG chat on insights
3. household.
4. bulk expenses

# todo
1. analytics tab load testing ui issues
2. RecurringView UI revamp to icon based like bharat billpay
3. add bharat billpay if possible?
4. Replace "Who owes whom" with a dynamic pie chart showing contribution vs. agreed-upon household ratio.


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
