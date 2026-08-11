# Swiggy MCP — Verification

## 1. Verified — no action

### Auth

| Fact | Source |
|---|---|
| No static client identity; `client_id` from DCR (RFC 7591) at `POST /auth/register`, cached per redirect URI | `oauth.ts` → `getSwiggyClientId` |
| DCR returns `client_id: "swiggy-mcp"` | live |
| `token_endpoint_auth_methods_supported` includes `"none"` — public client, no secret | `/.well-known/oauth-authorization-server` |
| Token exchange body is JSON: `grant_type`, `code`, `code_verifier`, `redirect_uri`. No `client_id` | live |
| `http://localhost` allowed as redirect URI; HTTPS otherwise; exact-match, no wildcards | docs |
| Access token 5 days (`expires_in: 432000`); auth code 120s single-use; session 30d idle sliding | docs |
| No refresh token issued in v1.0 — `/auth/token` handles `authorization_code` only. Expiry or revocation ⇒ re-run authorization. v1.1 roadmap | docs |
| Schema changes are additive under SemVer; type change or field removal needs major bump + 6-month deprecation | docs |
| DCR → authorize → consent → token → cookie | live |
| `swiggy_access_token` cookie is `httpOnly` | live |
| `/api/swiggy/status` clears stale `swiggy_linked` + `swiggy_address_id` on mount | live |
| Mock active only when `SWIGGY_MOCK=1`; unset in dev and prod | `client.ts` → `isMockMode` |

### Transport

| Fact | Source |
|---|---|
| `structuredContent` holds the payload directly — not wrapped in `{ success, data }` | live |
| `content[0].text` is prose, never JSON | live |
| `structuredContent` can be `{}`; `mcpCall` treats empty as absent, falls back to `content[]` | live |
| Prose-only tools: `mcpCall(..., { textOk: true })` returns `{ text }` | live |
| Endpoints: `/food`, `/im`, `/dineout` (unused) | docs |
| Failure envelope: `{ success: false, error: { message } }` | docs |
| Quotas: 70 req/min per user per server; 30/min write tools; burst 2× over 10s. 429 ⇒ stop, back off, never retry | docs |
| No `X-RateLimit-*` headers sent, contrary to docs | live |

| Tool | Response channel |
|---|---|
| `get_addresses`, `get_food_orders`, Instamart `get_orders` | `structuredContent` |
| `get_food_order_details` | prose only |

### Arguments

| Tool | Arguments |
|---|---|
| `get_addresses` | none |
| `get_food_orders` | `addressId` (required), `activeOnly` — we send `false` |
| `get_food_order_details` | `orderId` |
| Instamart `get_orders` | `count`, `orderType`, `activeOnly`. `"INSTAMART"` ⇒ 0 rows; `"DASH"` ⇒ rows — we send `"DASH"` |

### Wire fields

| Source | Fields |
|---|---|
| `get_addresses` | `id`, `addressLine`, `addressTag`, `addressCategory`, `phoneNumber` (masked) |
| `get_food_orders` | `orderId`, `restaurantId`, `restaurantName`, `restaurantAreaName`, `orderTotal` (string `"₹368"`), `orderedTime` (string `"August 11, 6:46 PM"` — no year, IST), `orderStatus` (`"Delivered"`), `orderDeliveryStatus` (`"delivered"`), `orderedItems`, `orderType`, `isActiveOrder`, `actions[]`. No payment field |
| Instamart `get_orders` | `orderId`, `storeName`, `status` (`"DELIVERED"`), `historyStatus`, `currentStatus`, `createdAt`/`updatedAt` (ISO 8601, zoned), `estimatedDeliveryTime`, `itemCount`, `totalAmount` (number), `paymentMethod` (`"Juspay"` — PSP, not instrument), `paymentStatus`, `refundStatus`, `orderType`, `isActive`, `deliveryAddress{id,addressLine,phoneNumber}`, `items[{name,quantity,itemId}]`, `billDetails{itemTotal,deliveryFee,packagingFee,grandTotal}` |
| `get_food_order_details` | prose: restaurant, `Placed: 2026-08-11 18:46:12`, per-item prices + image URLs, delivery address, `Total paid: ₹368`, `Payment: Credit/Debit card`, `Reorderable: yes` |

Payment instrument sources: Food ⇒ `get_food_order_details` `Payment:` line only.
Instamart ⇒ none. `get_payment_options` returns checkout options, not past-order instruments.

### Mapping

| Output | Value |
|---|---|
| `SwiggyAddress` | `label: "Office"`, `category: "Work"`, masked `phone` |
| `SwiggyActiveOrder` | `total_amount: 368`, `status: "delivered"`, `restaurant_area` |
| `placed_at` (Food) | `orderedTime` parsed as IST via `GMT+0530`; TZ-independent |
| `actions[]` | `reorder_items` with `is_veg`, `quantity`, `total`, `category` |
| `SwiggyInstamartOrder` | `total_amount: 331`/`2253`, `placed_at` = `createdAt`, `status: "delivered"`, `payment_provider: "Juspay"`, `items_display` from `items[]` |

---

## 2. Verify on next deploy

- [ ] `extractPaymentMethod`: `Payment: Credit/Debit card` → `"card"`

---

## 3. Verify — separate action each

- [ ] `Payment:` labels for UPI / Cash / wallet — unmatched labels return `undefined`
- [ ] `SwiggyOrderStatus` values beyond `"delivered"` — unmatched map to `"unknown"`
- [ ] `log_swiggy_order` card → IndexedDB write
- [ ] 401 → `swiggy_disconnected` + reconnect prompt. Revoke server-side to test
- [ ] Token expiry at 5 days → re-auth from Profile → Integrations
- [ ] `POST /auth/logout` revokes server-side

---

## 4. Open defects

- [ ] `AgentChat.tsx:342` — `timestamp: Date.now()` files historical orders under today. `log_swiggy_order` has no field for `placed_at`. Needs schema field + wiring
- [ ] `mcpCall` opens a fresh POST per tool call, no `initialize`, no session reuse. Docs call per-invocation reinit the top cause of production rate-limit breaches. Unmeasured whether each POST is an auth event
- [ ] No quota early warning. `watchRateLimit` is in place but never fires — no `X-RateLimit-*` headers arrive. Detection is after-the-fact:
      `vercel logs kharchakitab.com | grep -E "rate limit reached|swiggy quota low|swiggy rate limit headers"`

---

## 5. Cleanup

- [ ] Delete `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`, `getMockOrderStatus`, `isMockMode` from `client.ts`
- [ ] Delete `isMockMode` branches in `authorize/route.ts`, `callback/route.ts`, `disconnect/route.ts`, `tools.ts`
