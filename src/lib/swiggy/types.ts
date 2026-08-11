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

// Instamart shares nothing with Food beyond `orderId` — different keys, and
// better types: amounts are numbers and timestamps are ISO 8601 with a zone.
export interface SwiggyRawInstamartOrder {
  orderId?: string;
  storeName?: string;
  status?: string;              // "DELIVERED" — upper case
  historyStatus?: string;       // "DELIVERED"
  currentStatus?: string;       // prose, e.g. "Order delivered on 6 Aug 2026, 09:51 PM by ..."
  createdAt?: string;           // "2026-08-06T16:04:58.000Z" — real ISO 8601
  updatedAt?: string;
  estimatedDeliveryTime?: string; // "14 mins"
  itemCount?: number;
  totalAmount?: number;         // 331 — number, no currency symbol
  paymentMethod?: string;       // "Juspay" — the PSP, not a payment method
  paymentStatus?: string;       // "SUCCESS"
  refundStatus?: string;        // "NO_REFUND"
  orderType?: string;           // "DASH"
  isActive?: boolean;           // note: not isActiveOrder, as Food uses
  deliveryAddress?: {
    id?: string;
    addressLine?: string;
    phoneNumber?: string;
  };
  items?: { name?: string; quantity?: number; itemId?: string }[];
  billDetails?: {
    itemTotal?: number;
    deliveryFee?: number;
    packagingFee?: number;
    grandTotal?: number;
  };
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

export type SwiggyPaymentMethod = "upi" | "card" | "cash" | "wallet";

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
  // Swiggy reports the payment processor ("Juspay"), not the instrument — it
  // cannot be reduced to SwiggyPaymentMethod, so it is kept verbatim.
  payment_provider?: string;
  actions?: SwiggyOrderAction[];
}
