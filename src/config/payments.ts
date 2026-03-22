
import { Banknote, Smartphone, CreditCard, HelpCircle } from "lucide-react";

export const PAYMENT_OPTIONS = [
  { key: "cash", label: "Cash", icon: Banknote },
  { key: "upi", label: "UPI", icon: Smartphone },
  { key: "card", label: "Card", icon: CreditCard },
  { key: "unknown", label: "Other", icon: HelpCircle },
] as const;

export type PaymentKey = typeof PAYMENT_OPTIONS[number]["key"];


