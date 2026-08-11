# Swiggy MCP — Verification

## 1. Verified — no action

| Fact | Source |
|---|---|
| No static client identity exists. `client_id` comes from DCR (RFC 7591) at `POST /auth/register`, cached per redirect URI | `oauth.ts` → `getSwiggyClientId` |
| DCR returns `client_id: "swiggy-mcp"` | live prod |
| `token_endpoint_auth_methods_supported` includes `"none"` — public client, no secret | `/.well-known/oauth-authorization-server` |
| Token exchange body is JSON: `grant_type`, `code`, `code_verifier`, `redirect_uri`. No `client_id` | `callback/route.ts` |
| `http://localhost` is an allowed redirect URI. HTTPS required otherwise. Exact-match, no wildcards | Swiggy docs |
| Access token 5 days (`expires_in: 432000`). Auth code 120s single-use. Session 30d idle | Swiggy docs |
| Full chain works in prod: DCR → authorize → consent → token → cookie | live prod |
| `swiggy_access_token` cookie is `httpOnly` — unreadable from JS | live prod |
| `/api/swiggy/status` clears stale `swiggy_linked` + `swiggy_address_id` on mount | live prod |
| `result.content[0].text` is prose (`"Found 6 saved addresses..."`), not JSON | live prod |
| Endpoints: `POST mcp.swiggy.com/food`, `POST mcp.swiggy.com/im` | Swiggy docs |
| Failure envelope: `{ success: false, error: { message } }` | Swiggy docs |
| Mock active only when `SWIGGY_MOCK=1`. Unset in dev and prod | `client.ts` → `isMockMode` |

### Tool arguments (fixed)

| Tool | Arguments |
|---|---|
| `get_addresses` | none |
| `get_food_orders` | `addressId` (required), `activeOnly` (optional). We pass `false` — full history, expenses come from past orders |
| Instamart `get_orders` | `count`, `orderType`, `activeOnly`. `orderType` defaults to `"DASH"`; `"INSTAMART"` passed explicitly |

---

## 2. Unverified — one authenticated tool call resolves all

Blocked on: deploy current `mcpCall`, then run the three tools.

- [ ] Is `result.structuredContent` populated? If empty, the thrown error now contains the raw text
- [ ] `get_addresses` — array key inside `data` (assumed `addresses`)
- [ ] `get_addresses` — fields `id`, `label`, `address`
- [ ] `get_food_orders` — array key inside `data` (assumed `orders`)
- [ ] `get_food_orders` — fields `order_id`, `restaurant_name`, `items_display`, `total_amount`, `payment_method`, `status`, `placed_at`
- [ ] Instamart `get_orders` — array key inside `data` (assumed `orders`)
- [ ] Instamart `get_orders` — fields `order_id`, `store_name`, `items_display`, `total_amount`, `payment_method`, `status`, `placed_at`
- [ ] `placed_at` format — unix ms vs seconds vs ISO string
- [ ] `SwiggyOrderStatus` values — assumed `"placed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled"`
- [ ] `SwiggyInstamartOrderStatus` values
- [ ] `payment_method` values — assumed `"upi" | "card" | "cash" | "wallet"`; may be `"ONLINE"` / `"COD"` / `"WALLET"`
- [ ] `orderType: "INSTAMART"` returns orders — live call returned `"Found 0 orders"`

Files to update on mismatch: `types.ts`, `client.ts` (`fetchAddresses`, `fetchActiveOrders`, `fetchInstamartOrders`), `AgentChat.tsx` → `handleConfirm` (payment_method mapping).

---

## 3. Unverified — separate action each

- [ ] `get_swiggy_active_orders` with a real `address_id` returns orders — never executed; model aborted after `get_swiggy_addresses` failed
- [ ] `log_swiggy_order` confirmation card → IndexedDB write
- [ ] 401 → tools return `swiggy_disconnected` and agent tells user to reconnect. Revoke token server-side to test
- [ ] Token expiry at 5 days → re-auth from Profile → Integrations works
- [ ] `POST /auth/logout` revokes server-side
- [ ] Does `/auth/token` return a `refresh_token`? Server advertises the grant; docs' example omits it; `callback/route.ts` casts to `{ access_token }` and discards the rest. Log `Object.keys(tokenData)` to check

---

## 4. Cleanup — after section 2 passes

- [ ] Delete `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`, `getMockOrderStatus`, `isMockMode` from `client.ts`
- [ ] Delete the `isMockMode` branches in `authorize/route.ts`, `callback/route.ts`, `disconnect/route.ts`, `tools.ts`
