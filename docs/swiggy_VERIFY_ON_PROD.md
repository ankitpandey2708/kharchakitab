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
| Endpoints: `POST mcp.swiggy.com/food`, `POST mcp.swiggy.com/im` | Swiggy docs |
| Failure envelope: `{ success: false, error: { message } }` | Swiggy docs |

### Tool arguments

| Tool | Arguments |
|---|---|
| `get_addresses` | none |
| `get_food_orders` | `addressId` (required), `activeOnly` (optional; we pass `false` for full history) |
| `get_food_order_details` | `orderId` |
| Instamart `get_orders` | `count`, `orderType`, `activeOnly`. `orderType` defaults to `"DASH"` |

### Wire field names (captured live)

| `get_addresses` | `get_food_orders` |
|---|---|
| `id` | `orderId`, `restaurantId`, `restaurantName`, `restaurantAreaName` |
| `addressLine` | `orderTotal` — string, `"₹368"` |
| `addressTag` | `orderedTime` — string, `"August 11, 6:46 PM"`, **no year** |
| `addressCategory` | `orderStatus` `"Delivered"` / `orderDeliveryStatus` `"delivered"` |
| `phoneNumber` — masked | `orderedItems`, `orderType`, `isActiveOrder`, `actions[]` |

`get_food_orders` carries **no payment field**.

---

## 2. Unverified — needs a live call to resolve

- [ ] Instamart `get_orders` returned `{ orders: [] }` for `orderType: "INSTAMART"`. Code now falls back to `"DASH"`; confirm which returns rows
- [ ] Instamart field names — `storeName` is a guess; `mapInstamartOrder` falls back to `restaurantName` then a literal
- [ ] `get_food_order_details` payload shape, and where payment lives in it
- [ ] `SwiggyOrderStatus` values beyond `"delivered"` — unmatched values map to `"unknown"`
- [ ] `SwiggyPaymentMethod` values — `"upi" | "card" | "cash" | "wallet"` still a guess
- [ ] Does `/auth/token` return `refresh_token`? `callback/route.ts` logs `Object.keys(tokenData)` — read it on next connect

---

## 3. Unverified — separate action each

- [ ] `log_swiggy_order` confirmation card → IndexedDB write
- [ ] 401 → tools return `swiggy_disconnected` and the agent tells the user to reconnect. Revoke server-side to test
- [ ] Token expiry at 5 days → re-auth from Profile → Integrations
- [ ] `POST /auth/logout` revokes server-side

---

## 4. Known gap — not yet fixed

- [ ] `AgentChat.tsx:342` writes `timestamp: Date.now()` when logging an order, so a
      historical order is filed under today. `placed_at` is now parsed correctly but
      `log_swiggy_order` has no field to carry it. Needs a schema field + wiring.

---

## 5. Cleanup — after section 2 passes

- [ ] Delete `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`, `getMockOrderStatus`, `isMockMode` from `client.ts`
- [ ] Delete the `isMockMode` branches in `authorize/route.ts`, `callback/route.ts`, `disconnect/route.ts`, `tools.ts`
