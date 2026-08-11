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
| Access token 5 days (`expires_in: 432000`). Auth code 120s single-use. Session 30d idle | Swiggy docs |
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
| Endpoints: `POST mcp.swiggy.com/food`, `POST mcp.swiggy.com/im` | Swiggy docs |
| Failure envelope: `{ success: false, error: { message } }` | Swiggy docs |

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

**Instamart `get_orders`** — `orderId`, `storeName` confirmed. Keys for items, total, time and status
differ from Food and are still unknown.

### Mapping verified live

| Output | Value |
|---|---|
| `SwiggyAddress` | `label: "Office"`, `category: "Work"`, masked `phone` |
| `SwiggyActiveOrder` | `total_amount: 368` (number), `status: "delivered"`, `restaurant_area` |
| `actions[]` | `reorder_items` with `is_veg`, `quantity`, parsed `total`, `category` |
| `placed_at` | parsed as IST via `GMT+0530`; TZ-independent |

---

## 2. Unverified — needs the next deploy

- [ ] Instamart list keys for items / total / time / status — read `raw_sample` from the `get_swiggy_instamart_orders` tool output, then fix `mapInstamartOrder`
- [ ] `get_food_order_details` returned `{}` in `structuredContent`. With the empty-object fallback deployed, check whether `content[]` carries the payload — the tool may not be live ("Coming soon" in its docs)
- [ ] Where payment lives inside those details, if anywhere

---

## 3. Unverified — separate action each

- [ ] Does `/auth/token` return `refresh_token`? The `console.log` was deployed **after** the
      only connect, so no callback log exists. Needs a fresh connect (phone + OTP), then
      `vercel logs kharchakitab.com | grep "swiggy token response keys"`
- [ ] `SwiggyOrderStatus` values beyond `"delivered"` — unmatched values map to `"unknown"`
- [ ] `SwiggyPaymentMethod` values — `"upi" | "card" | "cash" | "wallet"` still a guess
- [ ] `log_swiggy_order` confirmation card → IndexedDB write
- [ ] 401 → tools return `swiggy_disconnected` and the agent tells the user to reconnect. Revoke server-side to test
- [ ] Token expiry at 5 days → re-auth from Profile → Integrations
- [ ] `POST /auth/logout` revokes server-side

---

## 4. Known gap — not fixed

- [ ] `AgentChat.tsx:342` writes `timestamp: Date.now()` when logging an order, filing a
      historical order under today. `placed_at` is parsed correctly but `log_swiggy_order`
      has no field to carry it. Needs a schema field + wiring.

---

## 5. Cleanup

- [ ] **Remove `raw_sample`** from `get_swiggy_instamart_orders` in `tools.ts` once section 2 is closed
- [ ] Rename `fetchInstamartOrdersWithRaw` → `fetchInstamartOrders` and drop the `raw` return at the same time
- [ ] Remove `console.log("swiggy token response keys:")` from `callback/route.ts` once answered
- [ ] Delete `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`, `getMockOrderStatus`, `isMockMode` from `client.ts`
- [ ] Delete the `isMockMode` branches in `authorize/route.ts`, `callback/route.ts`, `disconnect/route.ts`, `tools.ts`
