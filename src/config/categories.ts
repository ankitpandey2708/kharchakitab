import type React from "react";
import {
  Utensils,
  Car,
  Fuel,
  ShoppingBag,
  ShoppingCart,
  Tv,
  Shield,
  Landmark,
  Sparkles,
  GraduationCap,
  ReceiptText,
  HeartPulse,
  Film,
  Wallet,
  Building2,
} from "lucide-react";

export const CATEGORY_OPTIONS = [
  { key: "Grocery", icon: ShoppingBag },
  { key: "Online Ordering", icon: ShoppingCart },
  { key: "Eating out", icon: Utensils },
  { key: "Travel", icon: Car },
  { key: "Office Commute", icon: Car },
  { key: "Fuel", icon: Fuel },
  { key: "Shopping", icon: ShoppingBag },
  { key: "Bills", icon: ReceiptText },
  { key: "Rent", icon: Building2 },
  { key: "Subscriptions", icon: Tv },
  { key: "Insurance", icon: Shield },
  { key: "Financial", icon: Landmark },
  { key: "Home Services", icon: Sparkles },
  { key: "Education", icon: GraduationCap },
  { key: "Health", icon: HeartPulse },
  { key: "Entertainment", icon: Film },
  { key: "Other", icon: Wallet },
] as const;

export type CategoryKey = typeof CATEGORY_OPTIONS[number]["key"];

export const CATEGORY_LIST: CategoryKey[] = CATEGORY_OPTIONS.map((option) => option.key);

export const CATEGORY_ICON_MAP = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.key, o.icon])
) as unknown as Record<CategoryKey, React.ElementType>;
