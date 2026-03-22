# Premium Paywall Design


## Architecture

```
User taps locked feature
  -> Premium gate modal (shows price + feature list)
  -> Razorpay checkout (best for INR audience)
  -> Razorpay webhook hits /api/premium/activate
  -> API verifies payment, returns signed JWT (license key)
  -> Client stores JWT in localStorage
  -> Features unlock client-side by verifying JWT
```

## Payment Provider: Razorpay

Indian audience — Razorpay supports UPI, cards, wallets. One-time payment, no subscription complexity.


## License Verification (No Backend DB)

### Server-side: `/api/premium/activate`

Called after Razorpay payment success:

1. Verify payment with Razorpay API (`razorpay.payments.fetch(payment_id)`)
2. Store `payment_id -> true` in Upstash Redis (receipt ledger — already used for rate limiting)
3. Sign a JWT: `{ activated: true, features: ["all"], exp: null }`
4. Return JWT to client

JWT has no expiry (one-time purchase = lifetime). Signing secret stays server-side — users can't forge it.

### Client-side: `usePremium()` hook

```tsx
function usePremium() {
  const [isPremium, setIsPremium] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("kk_premium_token");
    if (token) {
      // Verify JWT structure + signature via /api/premium/verify
      // or decode-only with embedded public key
      setIsPremium(true);
    }
  }, []);

  return isPremium;
}
```

### Usage in components

```tsx
const isPremium = usePremium();
if (!isPremium) return <PremiumGate feature="kalKaTu" />;
```

## UI Flow

### Locked state

Feature shows a blurred preview + lock icon + "Unlock for Rs.199"

### Tap -> PremiumModal

- List of all premium features with previews
- Single price, single button: "Pay Rs.199"
- Razorpay opens inline (their `checkout.js`)

### Post-payment

- Razorpay callback -> `/api/premium/activate`
- JWT stored -> features unlock instantly
- Confetti animation + "Welcome to Premium"

## Server-Side API Routes (minimal)

### `POST /api/premium/activate`

Verify Razorpay `payment_id`, store receipt in Upstash Redis, return signed JWT.

### `POST /api/premium/webhook`

Razorpay webhook backup — marks payment in Upstash Redis. Handles edge cases where client callback fails.

## License Restore (Device Switch / Data Loss)

JWT lives in localStorage — if user loses device or switches phones, premium is lost without a restore mechanism.

### Approach: Phone-based restore (Razorpay already collects phone)

During Razorpay checkout, the user's phone number is captured automatically. We store it in Upstash Redis as the license lookup key. On a new device, user verifies their phone via OTP to restore premium.

### Upstash Redis Schema

```
premium:phone:+919876543210  ->  { payment_id, activated_at, device_count }
premium:payment:pay_XXXXX    ->  { phone, activated_at }
```

Two keys per purchase — lookup by phone (restore flow) and by payment_id (webhook/audit flow).

### Restore Flow

```
New device -> User taps "Already paid? Restore"
  -> Enter phone number
  -> /api/premium/otp/send  (send OTP via Razorpay/MSG91/Twilio)
  -> User enters OTP
  -> /api/premium/otp/verify (verify OTP)
  -> Server checks Upstash: premium:phone:+91XXXXXXXXXX exists?
     -> Yes: sign fresh JWT, return to client, increment device_count
     -> No:  "No purchase found for this number"
  -> Client stores JWT in localStorage -> features unlock
```

### API Routes for Restore

#### `POST /api/premium/otp/send`

```json
// Request
{ "phone": "+919876543210" }

// Response
{ "success": true, "message": "OTP sent" }
```

- Rate limit: 3 OTP requests per phone per hour (use existing Upstash rate limiter)
- OTP provider options: MSG91 (cheapest for India, ~Rs.0.15/OTP), Twilio, or Razorpay's built-in OTP

#### `POST /api/premium/otp/verify`

```json
// Request
{ "phone": "+919876543210", "otp": "834291" }

// Response — success
{ "success": true, "token": "eyJhbG..." }

// Response — no purchase found
{ "success": false, "error": "no_purchase" }
```

- Verify OTP with provider
- Lookup `premium:phone:{phone}` in Upstash Redis
- If found: sign fresh JWT, return it
- If not found: return error

### Updated `/api/premium/activate` (stores phone)

After Razorpay payment verification, now also stores the phone mapping:

```ts
// After verifying payment with Razorpay API
const phone = payment.contact; // Razorpay provides this
await redis.set(`premium:phone:${phone}`, {
  payment_id,
  activated_at: Date.now(),
  device_count: 1,
});
await redis.set(`premium:payment:${payment_id}`, {
  phone,
  activated_at: Date.now(),
});
// Sign and return JWT as before
```

### UI for Restore

- Link in PremiumModal: "Already paid? Restore purchase"
- Tapping opens a simple phone input -> OTP input flow
- Same modal, just a different view state
- On success: same confetti animation as fresh purchase

### Edge Cases

- **Multiple purchases same phone:** Latest payment wins, all are valid
- **Phone number changed:** User contacts support — manual lookup by payment_id in Upstash, re-map to new phone
- **Abuse (sharing phone):** `device_count` tracked in Redis. If > 3 devices restore, flag for review but don't block (false positives worse than minor abuse at early stage)

## Storage Keys

| Key                  | Type   | Purpose                    |
| -------------------- | ------ | -------------------------- |
| `kk_premium_token`   | string | Signed JWT license key     |

## Dependencies to Add

- `razorpay` — server-side payment verification
- `jsonwebtoken` — JWT signing/verification
- Razorpay `checkout.js` — client-side checkout (loaded via script tag)
- OTP provider SDK (MSG91 / Twilio) — for phone-based license restore

## Implementation Order

1. `usePremium` hook + `PremiumGate` component (client-side gating)
2. Razorpay checkout integration (client-side)
3. `/api/premium/activate` endpoint (JWT signing + Razorpay verification + phone mapping)
4. `/api/premium/webhook` endpoint (backup verification)
5. `/api/premium/otp/send` + `/api/premium/otp/verify` endpoints (restore flow)
6. Restore UI in PremiumModal ("Already paid?" flow)
7. Wire up premium gates on each viral hook feature
