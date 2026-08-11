import type { SwiggyAddress, SwiggyActiveOrder, SwiggyInstamartOrder } from "./types";
import type { CategoryKey } from "@/src/config/categories";
import { SWIGGY_MCP_FOOD_URL, SWIGGY_MCP_INSTAMART_URL } from "./oauth";

type SwiggyService = "food" | "instamart" | "dineout";

export const SERVICE_CATEGORY: Record<SwiggyService, CategoryKey> = {
  food: "Online Ordering",
  instamart: "Grocery",
  dineout: "Eating out",
};

// Opt-in only. Previously this keyed off a missing SWIGGY_CLIENT_ID, which no
// longer exists (see getSwiggyClientId) — production would have served mock
// data silently. Set SWIGGY_MOCK=1 to work offline against the fixtures below.
export const isMockMode = () => process.env.SWIGGY_MOCK === "1";

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

// Every tool returns { success, data, message } on success, { success, error } on
// failure — https://mcp.swiggy.com/builders/docs/reference/errors/
type SwiggyEnvelope<T> =
  | { success: true; data?: T; message?: string }
  | { success: false; error?: { message?: string } };

async function mcpCall<T>(
  token: string,
  mcpUrl: string,
  toolName: string,
  args: Record<string, unknown> = {}
): Promise<T | undefined> {
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

  // 401 = UNAUTHENTICATED / TOKEN_EXPIRED, 419 = SESSION_REVOKED
  if (res.status === 401 || res.status === 419) {
    throw Object.assign(new Error("Swiggy token revoked"), { status: 401 });
  }
  if (!res.ok) throw new Error(`Swiggy MCP error ${res.status}`);

  const body = await res.json() as {
    result?: {
      content?: { type: string; text?: string }[];
      structuredContent?: unknown;
      isError?: boolean;
    };
    error?: { message?: string };
  };

  if (body.error) throw new Error(body.error.message ?? `Swiggy tool ${toolName} failed`);

  const result = body.result;
  if (!result) throw new Error("Empty response from Swiggy");

  // content[] is the human-readable summary ("Found 6 saved addresses...") —
  // NOT JSON. The machine-readable payload comes back in structuredContent.
  // Fall back to parsing content[] for tools that only return text.
  const summary = result.content?.find((c) => typeof c.text === "string")?.text;

  let payload: unknown = result.structuredContent;
  if (payload === undefined) {
    if (!summary) throw new Error("Empty response from Swiggy");
    try {
      payload = JSON.parse(summary);
    } catch (e) {
      throw new Error(
        `Swiggy tool ${toolName} returned no structuredContent; text was: ${summary.slice(0, 200)}`,
        { cause: e }
      );
    }
  }

  if (result.isError) {
    throw new Error(summary ?? `Swiggy tool ${toolName} failed`);
  }

  // structuredContent may be the { success, data } envelope or the payload itself.
  if (payload && typeof payload === "object" && "success" in payload) {
    const envelope = payload as SwiggyEnvelope<T>;
    if (envelope.success === false) {
      throw new Error(envelope.error?.message ?? `Swiggy tool ${toolName} failed`);
    }
    return envelope.data;
  }

  return payload as T;
}

// ── Public fetch functions ─────────────────────────────────────────────────

export async function fetchAddresses(token: string): Promise<SwiggyAddress[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 600));
    return MOCK_ADDRESSES;
  }

  // Envelope is documented; the `addresses` key inside `data` is not — verify live.
  const data = await mcpCall<{ addresses?: SwiggyAddress[] }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_addresses" // takes no arguments
  );
  return data?.addresses ?? [];
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

  // activeOnly: false returns full order history, not just in-progress orders —
  // deliberate, since expenses are logged from past orders too.
  // The `orders` key inside `data` is undocumented — verify live.
  const data = await mcpCall<{ orders?: SwiggyActiveOrder[] }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_food_orders",
    { addressId, activeOnly: false }
  );
  return data?.orders ?? [];
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

  // orderType defaults to "DASH" server-side, so Instamart orders must be
  // requested explicitly. The `orders` key inside `data` is undocumented.
  const data = await mcpCall<{ orders?: SwiggyInstamartOrder[] }>(
    token,
    SWIGGY_MCP_INSTAMART_URL,
    "get_orders",
    { orderType: "INSTAMART", count: 10 }
  );
  return data?.orders ?? [];
}

