import type React from "react";
import {
  Utensils,
  Car,
  Fuel,
  ShoppingBag,
  Home,
  Zap,
  Tv,
  Shield,
  Landmark,
  Sparkles,
  GraduationCap,
  ReceiptText,
  HeartPulse,
  Film,
  Wallet,
} from "lucide-react";

export const CATEGORY_OPTIONS = [
  { key: "Food", icon: Utensils },
  { key: "Travel", icon: Car },
  { key: "Fuel", icon: Fuel },
  { key: "Shopping", icon: ShoppingBag },
  { key: "Bills", icon: ReceiptText },
  { key: "Housing", icon: Home },
  { key: "Utilities", icon: Zap },
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

export const CATEGORY_ICON_MAP: Record<CategoryKey, React.ElementType> = {
  Food: Utensils,
  Travel: Car,
  Fuel,
  Shopping: ShoppingBag,
  Bills: ReceiptText,
  Housing: Home,
  Utilities: Zap,
  Subscriptions: Tv,
  Insurance: Shield,
  Financial: Landmark,
  "Home Services": Sparkles,
  Education: GraduationCap,
  Health: HeartPulse,
  Entertainment: Film,
  Other: Wallet,
};
