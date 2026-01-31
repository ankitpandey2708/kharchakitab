# Features
P0
- Add/Manage(cancel, renew etc) recurring expense

P1
- Household from couple 2 devices pov
- Competitor analysis (Play store reviews)

P2
- Family mode
- import csv/xlsx
- Custom alerts
- entire UX to be STT and not just expense logging
- add multiple vendor backups for stt
  - gpt-4o-mini-transcribe: ~$0.18/hr ≈ ₹16.37/hr (platform.openai.com (https://platform.openai.com/docs/pricing/?
    utm_source=openai))
  - Sarvam STT: ₹30/hr (docs.sarvam.ai (https://docs.sarvam.ai/api-reference-docs/getting-started/pricing)
  - gpt-4o-transcribe: ~$0.36/hr ≈ ₹32.74/hr (platform.openai.com (https://platform.openai.com/docs/pricing/?
    utm_source=openai))
- signin flow
- hi-IN, bn-IN, kn-IN, ml-IN, mr-IN, od-IN, pa-IN, ta-IN, te-IN, gu-IN, en-IN
- more presets

# Bugs
- mobile responsive
- api latency

Pricing
1. cap on voice based entry, family mode
2. if MAU=1000 , then show Ads to free user.
3. custom alerts.
*******

await new Promise(r => indexedDB.open("QuickLogDB").onsuccess = e => e.target.result.transaction("transactions").objectStore("transactions").getAll().onsuccess = e => r(e.target.result));
———
  Create iOS Shortcut for KharchaKitab share

  1. Open Shortcuts app → tap + to create a new shortcut.
  2. Tap Add Action → search “Receive Images” → add it.
      - Tap the action’s settings (i) and enable “Show in Share Sheet”.
  3. Tap Add Action → search “Get Contents of URL” → add it.
      - URL: https://your-app.vercel.app/api/share/submit
      - Add a field: image = Shortcut Input
  4. Tap Add Action → search “Open URLs” → add it.
      - Input should be the result from “Get Contents of URL”.
  5. Name the shortcut: KharchaKitab Share.
  6. Tap Done.
  7. Share the shortcut: open it → tap Share → Copy iCloud Link → send me the link.

———