# Swiggy MCP — Verify on Production

Run through each item below on the first authenticated call and fix any mismatches.

There is no `SWIGGY_CLIENT_ID` to obtain — Swiggy issues no static client identity.
`getSwiggyClientId` self-registers via Dynamic Client Registration (RFC 7591) at
`POST /auth/register` and caches the returned `client_id` per redirect URI.
`http://localhost` is an allowed redirect URI, so this checklist can be run locally.

---

## 1. Response shapes (all assumed)

All `data` payloads inside `{ success, data, message }` are guessed.
Verify by logging raw responses on first prod call.

### `get_addresses`
File: `client.ts` → `fetchAddresses`
- [ ] Is the array at `data.addresses`?
- [ ] Field names: `id`, `label`, `address` — correct?

### `get_food_orders`
File: `client.ts` → `fetchActiveOrders`
- [ ] Is the array at `data.orders`?
- [ ] Field names: `order_id`, `restaurant_name`, `items_display`, `total_amount`, `payment_method`, `status`, `placed_at` — all correct?
- [ ] Is `placed_at` unix ms or seconds or ISO string?

### Instamart `get_orders`
File: `client.ts` → `fetchInstamartOrders`
- [ ] Is the array at `data.orders`?
- [ ] Field names: `order_id`, `store_name`, `items_display`, `total_amount`, `payment_method`, `status`, `placed_at` — all correct?
- [ ] Does `orderType: "INSTAMART"` return the expected orders (vs the `"DASH"` default)?

The `{ success, data, message }` envelope itself is documented and confirmed —
only the contents of `data` are unverified.

---

## 2. Status strings (assumed)

File: `types.ts` → `SwiggyOrderStatus`

Current assumption:
```
"placed" | "preparing" | "out_for_delivery" | "delivered" | "cancelled"
```

- [ ] Confirm exact strings from a real response
- [ ] Update `SwiggyOrderStatus` in `types.ts` to match

---

## 3. Arguments

Resolved from the published tool reference — no verification needed:

- `get_addresses` takes **no arguments**.
- `get_food_orders` takes `addressId` (required) and `activeOnly` (optional boolean).
  We pass `activeOnly: false` on purpose — full order history, since expenses are
  logged from past orders. There is no `orderCount` parameter.
- Instamart `get_orders` takes `count`, `orderType` and `activeOnly`.
  `orderType` defaults to `"DASH"` server-side, so `"INSTAMART"` must be passed explicitly.

---

## 4. Payment method values (assumed)

File: `types.ts` → `SwiggyActiveOrder.payment_method`

Current assumption: `"upi" | "card" | "cash" | "wallet"`
- [ ] Confirm exact values — Swiggy may use `"ONLINE"`, `"COD"`, `"WALLET"` etc.
- [ ] Update `payment_method` union in `types.ts` and the mapping in `AgentChat.tsx → handleConfirm` accordingly

---

## 5. Agent tool wiring

The agent (Gemini via Vercel AI SDK) calls Swiggy MCP through three tools in `src/lib/agent/tools.ts`:

| Agent tool | MCP tool called |
|---|---|
| `get_swiggy_addresses` | `get_addresses` |
| `get_swiggy_active_orders` | `get_food_orders` |
| `log_swiggy_order` | _(local — writes to IndexedDB after user confirmation)_ |

- [ ] Verify `get_swiggy_addresses` returns addresses the agent can pass to `get_swiggy_active_orders`
- [ ] Verify `get_swiggy_active_orders` with a real `address_id` returns live orders
- [ ] Verify `log_swiggy_order` confirmation card → DB write flow end-to-end

---

## 6. Mock mode

File: `client.ts` → `isMockMode`

Mock is active **only** when `SWIGGY_MOCK=1`. It is unset everywhere, so dev and
prod both run the real flow.

- [ ] Remove `MOCK_ADDRESSES`, `MOCK_INSTAMART_ORDERS`, `getMockActiveOrders`,
      `getMockOrderStatus` and `isMockMode` once real data is verified

---

## 7. Token lifecycle edge cases

- [ ] Test 401 handling: revoke the token from Swiggy's side, then confirm the agent
      returns `swiggy_disconnected` and tells the user to reconnect (rather than
      emitting a raw error string)
- [ ] Confirm `GET /api/swiggy/status` drives the Profile row: delete the
      `swiggy_access_token` cookie in devtools, refocus the tab, and the row should
      flip to disconnected even though `swiggy_linked` is still in localStorage
- [ ] Test token expiry after 5 days — full re-auth flow from Profile → Integrations → Connect Swiggy works?
- [ ] Confirm `POST /auth/logout` actually revokes the token server-side
