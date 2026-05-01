import type { SwiggyAddress, SwiggyActiveOrder, SwiggyInstamartOrder } from "./types";
import type { CategoryKey } from "@/src/config/categories";
import { SWIGGY_CLIENT_ID, SWIGGY_MCP_FOOD_URL, SWIGGY_MCP_INSTAMART_URL } from "./oauth";

type SwiggyService = "food" | "instamart" | "dineout";

export const SERVICE_CATEGORY: Record<SwiggyService, CategoryKey> = {
  food: "Online Ordering",
  instamart: "Grocery",
  dineout: "Eating out",
};

export const isMockMode = () =>
  !SWIGGY_CLIENT_ID || process.env.NODE_ENV === "development";

// ── Mock data ──────────────────────────────────────────────────────────────

const MOCK_ADDRESSES: SwiggyAddress[] = [
  { id: "addr_001", label: "Home", address: "Koramangala, Bengaluru" },
];

function getMockOrderStatus(pollingStartMs: number): SwiggyActiveOrder["status"] {
  const elapsed = Date.now() - pollingStartMs;
  if (elapsed < 5_000) return "preparing";
  if (elapsed < 10_000) return "out_for_delivery";
  return "delivered";
}

function getMockActiveOrders(pollingStartMs: number): SwiggyActiveOrder[] {
  return [
    {
      order_id: `sw_mock_${pollingStartMs}`,
      restaurant_name: "Domino's Pizza",
      items_display: "Peppy Paneer (M), Garlic Bread",
      total_amount: 349,
      payment_method: "upi",
      status: getMockOrderStatus(pollingStartMs),
      placed_at: pollingStartMs,
    },
  ];
}

// ── MCP call helper ────────────────────────────────────────────────────────

async function mcpCall<T>(
  token: string,
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(mcpUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (res.status === 401) throw Object.assign(new Error("Swiggy token revoked"), { status: 401 });
  if (!res.ok) throw new Error(`Swiggy MCP error ${res.status}`);

  const data = await res.json() as {
    result?: { content?: { type: string; text: string }[] };
  };
  const text = data?.result?.content?.[0]?.text;
  if (!text) throw new Error("Empty response from Swiggy");
  return JSON.parse(text) as T;
}

// ── Public fetch functions ─────────────────────────────────────────────────

export async function fetchAddresses(token: string): Promise<SwiggyAddress[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 600));
    return MOCK_ADDRESSES;
  }

  // TODO: verify response shape — assuming { data: { addresses: SwiggyAddress[] } }
  const res = await mcpCall<{ data?: { addresses?: SwiggyAddress[] } }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_addresses"
  );
  return res.data?.addresses ?? [];
}

export async function fetchActiveOrders(
  token: string,
  addressId: string,
  pollingStartMs: number
): Promise<SwiggyActiveOrder[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500));
    return getMockActiveOrders(pollingStartMs);
  }

  // TODO: verify response shape — assuming { data: { orders: SwiggyActiveOrder[] } }
  // TODO: verify argument name — using "addressId" and "orderCount" per docs
  const res = await mcpCall<{ data?: { orders?: SwiggyActiveOrder[] } }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_food_orders",
    { addressId }
  );
  return res.data?.orders ?? [];
}

const MOCK_INSTAMART_ORDERS: SwiggyInstamartOrder[] = [
  {
    order_id: "im_mock_001",
    store_name: "Swiggy Instamart",
    items_display: "Amul Milk 1L, Bread, Eggs (6pc)",
    total_amount: 187,
    payment_method: "upi",
    status: "delivered",
    placed_at: Date.now() - 2 * 60 * 60 * 1000,
  },
];

export async function fetchInstamartOrders(
  token: string
): Promise<SwiggyInstamartOrder[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500));
    return MOCK_INSTAMART_ORDERS;
  }

  // TODO: verify response shape — assuming { data: { orders: SwiggyInstamartOrder[] } }
  const res = await mcpCall<{ data?: { orders?: SwiggyInstamartOrder[] } }>(
    token,
    SWIGGY_MCP_INSTAMART_URL,
    "get_orders"
  );
  return res.data?.orders ?? [];
}

