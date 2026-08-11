// Two layers:
//   Raw*  — exactly what Swiggy MCP returns (camelCase, money and time as strings)
//   the rest — the domain shape the app consumes, produced by the mappers in client.ts
//
// Raw shapes below were captured from live prod responses on 2026-08-11.
// Instamart is the exception: it returned zero orders, so its raw shape is
// inferred from the food response and every field is optional.

// ── Raw (wire) shapes ──────────────────────────────────────────────────────

export interface SwiggyRawAddress {
  id?: string;
  addressLine?: string;      // full one-line address
  addressTag?: string;       // user's own label, e.g. "Office", "Manish"
  addressCategory?: string;  // "Home" | "Work" | "Other" | "Friends & Family"
  phoneNumber?: string;      // masked, e.g. "****8567"
}

interface SwiggyRawReorderItem {
  itemId?: string;
  name?: string;
  isVeg?: string;            // "1" | "0"
  quantity?: string;
  total?: string;
  subtotal?: string;
  packingCharges?: string;
  categoryDetails?: { category?: string; subCategory?: string };
  attributes?: { portionSize?: string; vegClassifier?: string };
}

export interface SwiggyRawOrderAction {
  type?: string;             // e.g. "PAST_ORDER_CTA_ENUM_REORDER"
  priority?: number;
  title?: string;            // e.g. "REORDER"
  isEnabled?: boolean;
  reorderMeta?: {
    orderItems?: SwiggyRawReorderItem[];
    restaurantCoverImageId?: string;
  };
}

export interface SwiggyRawFoodOrder {
  orderId?: string;
  restaurantId?: string;
  restaurantName?: string;
  restaurantAreaName?: string;
  orderTotal?: string;         // "₹368" — currency symbol included
  orderStatus?: string;        // "Delivered" — title case
  orderDeliveryStatus?: string; // "delivered" — lower case
  orderType?: string;          // "regular"
  orderedItems?: string;       // "Chicken Butter Garlic Noodles (1)"
  orderedTime?: string;        // "August 11, 6:46 PM" — no year
  isActiveOrder?: boolean;
  actions?: SwiggyRawOrderAction[];
}

// Unverified — get_orders returned { orders: [] } on the only live call.
export interface SwiggyRawInstamartOrder extends SwiggyRawFoodOrder {
  storeName?: string;
}

// ── Domain shapes ──────────────────────────────────────────────────────────

export interface SwiggyAddress {
  id: string;
  label: string;      // addressTag, falling back to addressCategory
  address: string;    // addressLine
  category?: string;  // addressCategory
  phone?: string;     // masked
}

// "unknown" is load-bearing: Swiggy's status vocabulary is not published, so an
// unrecognised value must not be silently coerced into a real state.
export type SwiggyOrderStatus =
  | "placed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"
  | "unknown";

type SwiggyPaymentMethod = "upi" | "card" | "cash" | "wallet";

export interface SwiggyReorderItem {
  item_id: string;
  name: string;
  quantity: number;
  total: number;
  is_veg: boolean;
  category?: string;
}

export interface SwiggyOrderAction {
  type: string;
  title: string;
  enabled: boolean;
  reorder_items?: SwiggyReorderItem[];
}

export interface SwiggyActiveOrder {
  order_id: string;
  restaurant_name: string;
  restaurant_area?: string;
  items_display: string;
  total_amount: number;   // parsed out of orderTotal
  placed_at: number;      // epoch ms parsed out of orderedTime
  status: SwiggyOrderStatus;
  is_active: boolean;
  // Absent from get_food_orders — only get_food_order_details carries payment info.
  payment_method?: SwiggyPaymentMethod;
  actions?: SwiggyOrderAction[];
}

export interface SwiggyInstamartOrder {
  order_id: string;
  store_name: string;
  items_display: string;
  total_amount: number;
  placed_at: number;
  status: SwiggyOrderStatus;
  is_active: boolean;
  payment_method?: SwiggyPaymentMethod;
  actions?: SwiggyOrderAction[];
}
