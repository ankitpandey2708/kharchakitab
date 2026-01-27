import type React from "react";
import {
  Utensils,
  Car,
  ShoppingBag,
  ReceiptText,
  HeartPulse,
  Wallet,
} from "lucide-react";

export const CATEGORY_OPTIONS = [
  { key: "Food", label: "Food", icon: Utensils },
  { key: "Travel", label: "Travel", icon: Car },
  { key: "Shopping", label: "Shopping", icon: ShoppingBag },
  { key: "Bills", label: "Bills", icon: ReceiptText },
  { key: "Health", label: "Health", icon: HeartPulse },
  { key: "Other", label: "Other", icon: Wallet },
] as const;

export type CategoryKey = typeof CATEGORY_OPTIONS[number]["key"];

export const CATEGORY_LIST: CategoryKey[] = CATEGORY_OPTIONS.map((option) => option.key);

export const CATEGORY_ICON_MAP: Record<CategoryKey, React.ElementType> = {
  Food: Utensils,
  Travel: Car,
  Shopping: ShoppingBag,
  Bills: ReceiptText,
  Health: HeartPulse,
  Other: Wallet,
};
