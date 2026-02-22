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
  { key: "Food", label: "Food", icon: Utensils },
  { key: "Travel", label: "Travel", icon: Car },
  { key: "Fuel", label: "Fuel", icon: Fuel },
  { key: "Shopping", label: "Shopping", icon: ShoppingBag },
  { key: "Bills", label: "Bills", icon: ReceiptText },
  { key: "Housing", label: "Housing", icon: Home },
  { key: "Utilities", label: "Utilities", icon: Zap },
  { key: "Subscriptions", label: "Subscriptions", icon: Tv },
  { key: "Insurance", label: "Insurance", icon: Shield },
  { key: "Financial", label: "Financial", icon: Landmark },
  { key: "Home Services", label: "Home Services", icon: Sparkles },
  { key: "Education", label: "Education", icon: GraduationCap },
  { key: "Health", label: "Health", icon: HeartPulse },
  { key: "Entertainment", label: "Entertainment", icon: Film },
  { key: "Other", label: "Other", icon: Wallet },
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
