# Features
P0
- https://docs.pwabuilder.com/#/builder/quick-start
- positioning copy
- Competitor analysis (Play store reviews)

P1
- Bugs : mobile responsive/all cards compact

P2
- Household UX (Shared ledger) and overall functionality
- Custom alerts
- entire UX to be STT and not just expense logging
- add multiple vendor backups for stt
  - gpt-4o-mini-transcribe: ~$0.18/hr ≈ ₹18/hr (platform.openai.com (https://platform.openai.com/docs/pricing/?
    utm_source=openai))
  - Sarvam STT: ₹30/hr (docs.sarvam.ai (https://docs.sarvam.ai/api-reference-docs/getting-started/pricing)
  - gpt-4o-transcribe: ~$0.36/hr ≈ ₹36/hr (platform.openai.com (https://platform.openai.com/docs/pricing/?
    utm_source=openai))
- hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, od-IN, pa-IN, ta-IN, te-IN, gu-IN, en-IN

# Pricing
1. cap on voice based entry
2. if MAU=1000 , then show Ads to free user.
3. RAG chat on insights and household.
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