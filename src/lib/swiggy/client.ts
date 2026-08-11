import type {
  SwiggyAddress,
  SwiggyActiveOrder,
  SwiggyInstamartOrder,
  SwiggyOrderAction,
  SwiggyOrderStatus,
  SwiggyRawAddress,
  SwiggyRawFoodOrder,
  SwiggyRawInstamartOrder,
  SwiggyRawOrderAction,
  SwiggyReorderItem,
} from "./types";
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
      is_active: true,
    },
  ];
}

// ── Wire → domain mapping ──────────────────────────────────────────────────

/** "₹368" / "₹1,234.50" → 368 / 1234.5 */
function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw !== "string") return 0;
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * "August 11, 6:46 PM" → epoch ms. Swiggy omits the year, so assume the current
 * one and step back if that lands in the future — otherwise every December order
 * read in January is dated eleven months ahead.
 */
function parsePlacedAt(raw: unknown, now: number = Date.now()): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;

  const m = raw.match(/^\s*([A-Za-z]+\s+\d{1,2})\s*,\s*(.+?)\s*$/);
  if (!m) return 0;

  const [, dayPart, timePart] = m;
  const at = (year: number) => Date.parse(`${dayPart}, ${year} ${timePart}`);

  const thisYear = at(new Date(now).getFullYear());
  if (!Number.isFinite(thisYear)) return 0;

  // One day of slack absorbs clock skew between us and Swiggy.
  if (thisYear <= now + 86_400_000) return thisYear;

  const lastYear = at(new Date(now).getFullYear() - 1);
  return Number.isFinite(lastYear) ? lastYear : thisYear;
}

const ORDER_STATUS: Record<string, SwiggyOrderStatus> = {
  placed: "placed",
  confirmed: "placed",
  order_placed: "placed",
  preparing: "preparing",
  food_being_prepared: "preparing",
  out_for_delivery: "out_for_delivery",
  on_the_way: "out_for_delivery",
  delivered: "delivered",
  completed: "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
};

/** Prefers orderDeliveryStatus ("delivered") over orderStatus ("Delivered"). */
function parseStatus(raw: SwiggyRawFoodOrder): SwiggyOrderStatus {
  const source = raw.orderDeliveryStatus ?? raw.orderStatus ?? "";
  const key = source.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return ORDER_STATUS[key] ?? "unknown";
}

function mapReorderItems(action: SwiggyRawOrderAction): SwiggyReorderItem[] | undefined {
  const items = action.reorderMeta?.orderItems;
  if (!items?.length) return undefined;

  return items.map((i) => ({
    item_id: i.itemId ?? "",
    name: i.name ?? "",
    quantity: Number(i.quantity ?? 1) || 1,
    total: parseAmount(i.total),
    is_veg: i.isVeg === "1" || i.attributes?.vegClassifier === "VEG_CLASSIFIER_VEG",
    category: i.categoryDetails?.category,
  }));
}

function mapActions(raw: SwiggyRawFoodOrder): SwiggyOrderAction[] | undefined {
  if (!raw.actions?.length) return undefined;

  return raw.actions.map((a) => ({
    type: a.type ?? "",
    title: a.title ?? "",
    enabled: a.isEnabled !== false,
    reorder_items: mapReorderItems(a),
  }));
}

function mapAddress(raw: SwiggyRawAddress): SwiggyAddress {
  return {
    id: raw.id ?? "",
    label: raw.addressTag || raw.addressCategory || "Address",
    address: raw.addressLine ?? "",
    category: raw.addressCategory,
    phone: raw.phoneNumber,
  };
}

function mapFoodOrder(raw: SwiggyRawFoodOrder): SwiggyActiveOrder {
  return {
    order_id: raw.orderId ?? "",
    restaurant_name: raw.restaurantName ?? "",
    restaurant_area: raw.restaurantAreaName,
    items_display: raw.orderedItems ?? "",
    total_amount: parseAmount(raw.orderTotal),
    placed_at: parsePlacedAt(raw.orderedTime),
    status: parseStatus(raw),
    is_active: raw.isActiveOrder === true,
    actions: mapActions(raw),
  };
}

function mapInstamartOrder(raw: SwiggyRawInstamartOrder): SwiggyInstamartOrder {
  return {
    order_id: raw.orderId ?? "",
    // Field unverified — get_orders returned no rows to inspect.
    store_name: raw.storeName || raw.restaurantName || "Swiggy Instamart",
    items_display: raw.orderedItems ?? "",
    total_amount: parseAmount(raw.orderTotal),
    placed_at: parsePlacedAt(raw.orderedTime),
    status: parseStatus(raw),
    is_active: raw.isActiveOrder === true,
    actions: mapActions(raw),
  };
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

  const data = await mcpCall<{ addresses?: SwiggyRawAddress[] }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_addresses" // takes no arguments
  );
  return (data?.addresses ?? []).map(mapAddress);
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
  const data = await mcpCall<{ orders?: SwiggyRawFoodOrder[] }>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_food_orders",
    { addressId, activeOnly: false }
  );
  return (data?.orders ?? []).map(mapFoodOrder);
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
    is_active: false,
  },
];

export async function fetchInstamartOrders(
  token: string
): Promise<SwiggyInstamartOrder[]> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 500));
    return MOCK_INSTAMART_ORDERS;
  }

  // orderType is documented only as `e.g. "DASH", "INSTAMART"` with "DASH" as the
  // server default, and neither term is defined. INSTAMART returned zero rows on
  // the one live call, so try it first and fall back to the default rather than
  // reporting "no orders" off an unverified filter.
  for (const orderType of ["INSTAMART", "DASH"] as const) {
    const data = await mcpCall<{ orders?: SwiggyRawInstamartOrder[] }>(
      token,
      SWIGGY_MCP_INSTAMART_URL,
      "get_orders",
      { orderType, count: 10 }
    );

    const raw = data?.orders ?? [];
    if (raw.length > 0) return raw.map(mapInstamartOrder);
  }

  return [];
}

/**
 * get_food_orders carries no payment info — get_food_order_details does
 * ("items, variants, pricing breakdown, delivery address, payment info").
 * Its shape is unpublished and untested, so the payload is returned raw for the
 * agent to read rather than mapped against guessed field names. Called only when
 * logging a specific order, not per row of a list.
 */
export async function fetchFoodOrderDetails(
  token: string,
  orderId: string
): Promise<Record<string, unknown> | undefined> {
  if (isMockMode()) {
    await new Promise((r) => setTimeout(r, 400));
    return { orderId, paymentMethod: "upi", mock: true };
  }

  return mcpCall<Record<string, unknown>>(
    token,
    SWIGGY_MCP_FOOD_URL,
    "get_food_order_details",
    { orderId }
  );
}

