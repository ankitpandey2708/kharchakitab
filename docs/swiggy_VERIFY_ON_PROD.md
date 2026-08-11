# Swiggy MCP — Verification

## 1. Verified — no action

### Auth

| Fact | Source |
|---|---|
| No static client identity. `client_id` comes from DCR (RFC 7591) at `POST /auth/register`, cached per redirect URI | `oauth.ts` → `getSwiggyClientId` |
| DCR returns `client_id: "swiggy-mcp"` | live prod |
| `token_endpoint_auth_methods_supported` includes `"none"` — public client, no secret | `/.well-known/oauth-authorization-server` |
| Token exchange body is JSON: `grant_type`, `code`, `code_verifier`, `redirect_uri`. No `client_id` | live prod |
| `http://localhost` allowed as redirect URI; HTTPS otherwise; exact-match, no wildcards | Swiggy docs |
| Access token 5 days (`expires_in: 432000`). Auth code 120s single-use. Session 30d idle sliding | Swiggy docs |
| **No refresh token.** Metadata advertises the `refresh_token` grant but issuance is not wired in v1.0 — `/auth/token` handles `authorization_code` only. Expiry or revocation means re-running authorization. Rolling refresh is a v1.1 roadmap item | Swiggy docs |
| Response schema is additive under SemVer: adding a field is non-breaking, **changing a field's type or removing one requires a major bump + 6-month deprecation**. Optional-field mapping is therefore safe | Swiggy docs |
| Full chain works: DCR → authorize → consent → token → cookie | live prod |
| `swiggy_access_token` cookie is `httpOnly` | live prod |
| `/api/swiggy/status` clears stale `swiggy_linked` + `swiggy_address_id` on mount | live prod |
| Mock active only when `SWIGGY_MOCK=1`; unset in dev and prod | `client.ts` → `isMockMode` |

### Transport

| Fact | Source |
|---|---|
| `result.structuredContent` holds the payload **directly** — not wrapped in `{ success, data }` | live prod |
| `result.content[0].text` is prose (`"Found 6 saved addresses..."`), never JSON | live prod |
| `structuredContent` can be `{}` — `mcpCall` treats empty as absent and falls back to `content[]` | live prod |
| Some tools send **no** `structuredContent` and answer in prose only. `mcpCall(..., { textOk: true })` returns `{ text }` for those instead of throwing | live prod |
| Endpoints: `POST mcp.swiggy.com/food`, `POST mcp.swiggy.com/im`, `POST mcp.swiggy.com/dineout` (unused) | Swiggy docs |
| Failure envelope: `{ success: false, error: { message } }` | Swiggy docs |
| Quotas: **70 req/min** per user per server, **30/min** for write tools, burst 2× over 10s. 429 → `RATE_LIMITED`: stop, back off, never retry. `X-RateLimit-*` on every success | Swiggy docs |

Per-tool response channel:

| Tool | Channel |
|---|---|
| `get_addresses`, `get_food_orders`, Instamart `get_orders` | `structuredContent` |
| `get_food_order_details` | prose only (`textOk`) |

### Tool arguments

| Tool | Arguments |
|---|---|
| `get_addresses` | none |
| `get_food_orders` | `addressId` (required), `activeOnly` (we pass `false` for full history) |
| `get_food_order_details` | `orderId` |
| Instamart `get_orders` | `count`, `orderType`, `activeOnly`. **`"INSTAMART"` returns 0 rows; `"DASH"` returns rows** — we send `"DASH"` |

### Wire field names (captured live)

**`get_addresses`** — `id`, `addressLine`, `addressTag`, `addressCategory`, `phoneNumber` (masked)

**`get_food_orders`** — `orderId`, `restaurantId`, `restaurantName`, `restaurantAreaName`,
`orderTotal` (string, `"₹368"`), `orderedTime` (string, `"August 11, 6:46 PM"`, **no year, IST**),
`orderStatus` (`"Delivered"`) / `orderDeliveryStatus` (`"delivered"`), `orderedItems`,
`orderType`, `isActiveOrder`, `actions[]`. **No payment field.**

**Instamart `get_orders`** — shares nothing with Food but `orderId`, and is better typed:
`storeName`, `status` (`"DELIVERED"`, upper), `historyStatus`, `currentStatus` (prose),
`createdAt` / `updatedAt` (**real ISO 8601 with zone**), `estimatedDeliveryTime`, `itemCount`,
`totalAmount` (**number**, no symbol), `paymentMethod` (`"Juspay"` — the PSP, not an instrument),
`paymentStatus`, `refundStatus`, `orderType` (`"DASH"`), `isActive` (**not** `isActiveOrder`),
`deliveryAddress{id,addressLine,phoneNumber}`, `items[{name,quantity,itemId}]`,
`billDetails{itemTotal,deliveryFee,packagingFee,grandTotal}`.

**`get_food_order_details`** — no `structuredContent` at all; prose only. Carries restaurant,
`Placed: 2026-08-11 18:46:12` (full timestamp, with year), per-item prices and totals.
That timestamp independently confirms the IST reading of `orderedTime`.

### Mapping verified live

| Output | Value |
|---|---|
| `SwiggyAddress` | `label: "Office"`, `category: "Work"`, masked `phone` |
| `SwiggyActiveOrder` | `total_amount: 368` (number), `status: "delivered"`, `restaurant_area` |
| `actions[]` | `reorder_items` with `is_veg`, `quantity`, parsed `total`, `category` |
| `placed_at` (Food) | `orderedTime` parsed as IST via `GMT+0530`; TZ-independent |

Instamart needs none of Food's coercion — `totalAmount` is already a number and
`createdAt` a zoned ISO string, so `mapInstamartOrder` parses it directly.

---

## 2. Unverified — needs the next deploy

- [ ] `mapInstamartOrder` rewritten against the real shape — confirm items / total / time / status now populate
- [ ] `get_food_order_details` now returns `{ text }` instead of throwing — read the full prose and check whether payment instrument appears in it
- [ ] If it does, decide how to extract it; if not, `payment_method` is unobtainable for Food.
      `get_payment_options` does **not** help — it lists instruments available for a cart at
      checkout (`data.platforms.mobile.methods[]`, `data.platforms.desktop.methods[]`,
      `data.cod`), not what a past order was paid with

---

## 3. Unverified — separate action each

- [ ] `SwiggyOrderStatus` values beyond `"delivered"` — unmatched values map to `"unknown"`
- [ ] `SwiggyPaymentMethod` values — `"upi" | "card" | "cash" | "wallet"` still a guess.
      Instamart reports only `paymentMethod: "Juspay"` (the PSP), kept verbatim in
      `payment_provider`; the instrument is not exposed. Food may expose it in the
      `get_food_order_details` prose — see section 2
- [ ] `log_swiggy_order` confirmation card → IndexedDB write
- [ ] 401 → tools return `swiggy_disconnected` and the agent tells the user to reconnect. Revoke server-side to test
- [ ] Token expiry at 5 days → re-auth from Profile → Integrations
- [ ] `POST /auth/logout` revokes server-side

---

## 4. Known gaps — not fixed

- [ ] `AgentChat.tsx:342` writes `timestamp: Date.now()` when logging an order, filing a
      historical order under today. `placed_at` is parsed correctly but `log_swiggy_order`
      has no field to carry it. Needs a schema field + wiring.
- [ ] **No persistent MCP session.** `mcpCall` opens a fresh `POST` per tool call with no
      `initialize` handshake. Swiggy's guidance is one session per user reused across calls,
      and calls reinitializing per invocation "the most common cause of rate limit breaches
      in production". Serverless functions make a long-lived session awkward; unmeasured
      whether each POST counts as an auth event.

      **How to watch** — `watchRateLimit` in `client.ts` logs the full `X-RateLimit-*` set
      once per cold start (to pin the header names, which the docs don't specify) and warns
      when remaining quota drops below 20:
      ```
      vercel logs kharchakitab.com | grep -E "swiggy rate limit headers|swiggy quota low|rate limit reached"
      ```
      - [ ] Read the header names from the first dump, then narrow the parsing to them
      - [ ] No hits after real traffic ⇒ per-POST auth events are not a problem in practice

---

## 5. Cleanup

- [ ] **Remove `raw_sample`** from `get_swiggy_instamart_orders` in `tools.ts` once section 2 is closed
- [ ] Rename `fetchInstamartOrdersWithRaw` → `fetchInstamartOrders` and drop the `raw` return at the same time
- [ ] Delete `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`, `getMockOrderStatus`, `isMockMode` from `client.ts`
- [ ] Delete the `isMockMode` branches in `authorize/route.ts`, `callback/route.ts`, `disconnect/route.ts`, `tools.ts`
