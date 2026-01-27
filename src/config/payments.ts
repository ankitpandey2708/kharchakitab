import type React from "react";
import { Banknote, Smartphone, CreditCard, HelpCircle } from "lucide-react";

export const PAYMENT_OPTIONS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "unknown", label: "Other", icon: HelpCircle },
] as const;

export type PaymentKey = typeof PAYMENT_OPTIONS[number]["key"];

export const PAYMENT_ICON_MAP: Record<PaymentKey, React.ElementType> = {
  cash: Banknote,
  upi: Smartphone,
  card: CreditCard,
  unknown: HelpCircle,
};
