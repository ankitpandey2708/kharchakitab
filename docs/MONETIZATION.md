# Monetization Strategy — Kharchakitab

## North Star
> "Free gets you hooked. Paid gets you serious."

Indian users won't pay for what feels like a demo. Free tier must be **genuinely useful** solo. Paid must feel like **unfair value** for couples/families.

---

## Free vs Paid

| Feature | Free | Pro (₹99/mo or ₹799/yr) |
|---|---|---|
| Transaction logging | ✅ Unlimited | ✅ |
| Basic categories | ✅ | ✅ |
| Tags | Up to 5 | Unlimited |
| Recurring templates | Up to 3 | Unlimited |
| Analytics | Current month only | Full history, all views |
| **Device pairing/sync** | ❌ | ✅ **Killer feature** |
| **AgentChat / MannKiBaat AI** | ❌ | ✅ |
| **Voice input** | ❌ | ✅ |
| **Receipt upload** | ❌ | ✅ |
| Export CSV/PDF | ❌ | ✅ |
| Private transactions | ❌ | ✅ |
| Budget alerts | ❌ | ✅ |
| Custom categories | ❌ | ✅ |

**Family Plan: ₹1,199/yr** — 2 devices, shared sync. Natural upsell since pairing already exists in the app.

---

## Why This Split Works

- **Don't gate transactions.** Locking core logging kills trust and retention. Indian users will just uninstall.
- **Gate sync hard.** Couples sharing finances is the #1 use case. One person pays, drags the partner in. This is your growth loop.
- **Gate AI hard.** MannKiBaat + AgentChat are differentiators. Let free users *see* it exists (blurred teaser) but not use it.
- **3 recurring templates** is generous enough to not frustrate solopreneurs but tight enough that anyone serious (rent + EMI + SIP = 3 already used up) upgrades.
- **Analytics gating at 1 month** — tax season and year-end reviews are natural upgrade triggers.

---

## Pricing for India

| Plan | Price | Notes |
|---|---|---|
| Monthly | ₹99/mo | Good for trial converts |
| Annual | ₹799/yr | ~33% discount — push this hard |
| Family | ₹1,199/yr | 2 paired devices |
| Launch promo | ₹499/yr | First 6 months — creates urgency |

Payment: **Razorpay** — supports UPI, UPI AutoPay (for subscriptions), cards, netbanking. UPI AutoPay is critical — Indians prefer it over card subscriptions.

---

## Validating Paid Access in a Local-First App

Three-layer approach:

### Layer 1 — Signed Entitlement Token (offline-capable)

On purchase, backend issues a **signed JWT**:

```json
{
  "device_id": "...",
  "plan": "pro",
  "expires_at": 1780000000,
  "issued_at": 1748000000
}
```

Signed with Ed25519 private key. App ships with the **public key baked in**. Validates locally — no network needed. Store token in IndexedDB.

### Layer 2 — Refresh with TTL (trust but verify)

- On every app open **with internet**: hit lightweight endpoint (Cloudflare Worker + KV, ~$0/month), refresh token, reset 30-day TTL
- **Offline grace period**: 30 days — user in a hill station, still works
- After 30 days offline with expired token: show "Connect once to verify subscription" — don't hard-lock, just nag

### Layer 3 — Sync Server as Hard Gate

Sync already requires internet. Before any sync handshake, server validates device entitlement. **Non-paying devices cannot initiate or receive sync.** Server-enforced, unbypassable.

### AppContext Logic

```
AppContext loads
→ check IndexedDB for token
→ validate signature locally
  → valid: isPro = true
  → expired + internet: refresh token in background
  → expired + offline: isPro = true + "verify soon" banner (grace period)
  → never purchased: isPro = false
```

People who crack the JWT still can't sync — that's your stickiest feature.

---

## Validate Before Building

Before writing a line of payment code:

1. **Pre-orders now.** Add "Support Kharchakitab — ₹799/yr" button. 20 pre-orders = strong signal.
2. **Gate sync behind waitlist.** "Sync with partner coming soon — join waitlist." Measure signups.
3. **Talk to top 10 active users.** Ask which feature they'd pay for. Answer will probably be sync.

---

## Execution Order

1. Razorpay account + UPI AutoPay mandate setup
2. Lightweight entitlement backend (Cloudflare Workers + KV)
3. Token issuance on purchase, validation in `AppContext`
4. Sync server entitlement check (server-side hard gate)
5. Feature flags wired to `isPro` in context
6. Paywall UI (non-annoying — show value, don't block aggressively)
7. Launch annual plan first, monthly later

---

## Token Recovery (Browser Clear / Device Switch)

IndexedDB is wiped when a user clears browser data. Token gone = locked out despite paying. Fix: **minimal account system for token re-issuance.**

### Flow

1. User pays → Razorpay webhook → backend stores `{ email, plan, expires_at }`
2. JWT issued and stored in IndexedDB (normal flow)
3. User clears browser → token gone
4. App shows "Verify your subscription" screen
5. User enters **email only** → backend sends OTP (no password needed)
6. User verifies OTP → backend re-issues signed JWT → stored back in IndexedDB
7. App works again

### What you need on the backend

- Table: `subscriptions(email, plan, expires_at, razorpay_subscription_id)`
- Endpoint: `POST /claim-token` — takes email + OTP, returns signed JWT
- OTP delivery: email via [Resend.com](https://resend.com) (free tier sufficient) or SMS via Fast2SMS (India-friendly)

### What you don't need

- Passwords
- Sessions or cookies
- Complex auth infrastructure

**Email is the recovery key.** Razorpay collects it at purchase anyway. That's the only persistent identity required. After re-issuance, bind the new JWT to the current `device_id` and the existing flow takes over.

---

## Bottom Line

Sync is your moat. Price it to feel like a no-brainer for couples. The local-first architecture is a **selling point** — "your data never leaves your device unless *you* sync it." Lean into that trust narrative.
