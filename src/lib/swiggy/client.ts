import type { SwiggyAddress, SwiggyActiveOrder } from "./types";
import type { CategoryKey } from "@/src/config/categories";
import { SWIGGY_CLIENT_ID, SWIGGY_MCP_FOOD_URL } from "./oauth";

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
  { id: "addr_002", label: "Work", address: "Indiranagar, Bengaluru" },
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
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  const res = await fetch(SWIGGY_MCP_FOOD_URL, {
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
    "get_food_orders",
    { addressId, orderCount: 20 }
  );
  return res.data?.orders ?? [];
}

