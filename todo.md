# Features
P0
- Add/Manage(cancel, renew etc) recurring expense

P1
- Manage subscriptions
- Competitor analysis (Play store reviews)
- Family mode

P2
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
********
let req = indexedDB.open('QuickLogDB'); req.onsuccess = () => { const s = req.result.transaction('transactions', 'readwrite').objectStore('transactions'); s.getAll().onsuccess = e => { const rows = e.target.result; if (!rows.length) return; const latest = rows.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)); const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); for (let i = 0; i < 4; i++) { const randomMs = Math.floor(Math.random() * 24 * 60 * 60 * 1000); s.add({ ...latest, id: crypto.randomUUID(), timestamp: startOfDay + randomMs, }); } }; };