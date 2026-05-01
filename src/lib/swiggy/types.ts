// TODO: verify all field names against actual Swiggy MCP response shapes

export interface SwiggyAddress {
  id: string;         // TODO: verify field name
  label: string;      // e.g. "Home", "Work"
  address: string;    // human-readable address string
}

type SwiggyOrderStatus =
  | "placed"
  | "preparing"
  | "out_for_delivery"
  | "delivered"
  | "cancelled"; // TODO: verify exact status strings from Swiggy

export interface SwiggyActiveOrder {
  order_id: string;           // TODO: verify field name
  restaurant_name: string;    // TODO: verify field name
  items_display: string;      // TODO: verify field name
  total_amount: number;       // TODO: verify field name
  payment_method: "upi" | "card" | "cash" | "wallet"; // TODO: verify values
  status: SwiggyOrderStatus;  // TODO: verify field name and values
  placed_at: number;          // unix ms — TODO: verify field name and format
}
