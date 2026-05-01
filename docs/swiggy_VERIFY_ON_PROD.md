# Swiggy MCP — Verify on Production

Once you have a real `SWIGGY_CLIENT_ID`, run through each item below and fix any mismatches.

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

### `get_addresses`
File: `client.ts` → `fetchAddresses`
- [ ] Confirm no required arguments (currently called with no args)

### `get_food_orders`
File: `client.ts` → `fetchActiveOrders`
- [ ] Confirm argument name is `addressId` (not `address_id` or `deliveryAddressId`)
- [ ] Confirm argument name is `orderCount` (not `limit` or `count`)

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

Mock is active when `NODE_ENV === "development"` OR `SWIGGY_CLIENT_ID` is unset.
- [ ] After setting `SWIGGY_CLIENT_ID` in prod, confirm mock never activates
- [ ] Remove `MOCK_ADDRESSES`, `getMockActiveOrders`, `getMockOrderStatus` once real data is verified

---

## 7. Token lifecycle edge cases

- [ ] Test 401 handling: revoke token manually from Swiggy side, confirm AgentChat surfaces an error and the Profile page shows disconnected state
- [ ] Test token expiry after 5 days — full re-auth flow from Profile → Integrations → Connect Swiggy works?
- [ ] Confirm `POST /auth/logout` actually revokes the token server-side
