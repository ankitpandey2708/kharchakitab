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
1. Replace "Who owes whom" with a dynamic pie chart showing contribution vs. agreed-upon household ratio.