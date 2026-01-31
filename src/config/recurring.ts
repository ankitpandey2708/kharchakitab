import type React from "react";
import {
  HeartPulse,
  Shield,
  Car,
  Home,
  Tv,
  Music,
  Dumbbell,
  Film,
  Wifi,
  Smartphone,
  Zap,
  Flame,
  CookingPot,
  Sparkles,
  Building2,
  CreditCard,
  PiggyBank,
  Landmark,
  Satellite,
  Droplets,
  GraduationCap,
  Baby,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import type { CategoryKey } from "@/src/config/categories";

export type Frequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "quarterly"
  | "halfyearly"
  | "yearly";

export const FREQUENCY_OPTIONS: {
  key: Frequency;
  label: string;
  shortLabel: string;
  days: number;
}[] = [
  { key: "daily", label: "Daily", shortLabel: "Daily", days: 1 },
  { key: "weekly", label: "Weekly", shortLabel: "Weekly", days: 7 },
  { key: "biweekly", label: "Bi-weekly", shortLabel: "Bi-weekly", days: 14 },
  { key: "monthly", label: "Monthly", shortLabel: "Monthly", days: 30 },
  { key: "quarterly", label: "Quarterly", shortLabel: "Quarterly", days: 91 },
  { key: "halfyearly", label: "Half-yearly", shortLabel: "6 Months", days: 182 },
  { key: "yearly", label: "Yearly", shortLabel: "Yearly", days: 365 },
];

export const FREQUENCY_LABEL_MAP: Record<Frequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Bi-weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  halfyearly: "Half-yearly",
  yearly: "Yearly",
};

export type TemplateGroup =
  | "insurance"
  | "subscriptions"
  | "home_services"
  | "utilities"
  | "financial"
  | "education"
  | "other";

export const TEMPLATE_GROUPS: {
  key: TemplateGroup;
  label: string;
  description: string;
}[] = [
  { key: "insurance", label: "Insurance", description: "Health, life, vehicle coverage" },
  { key: "subscriptions", label: "Subscriptions", description: "Streaming, gym, apps" },
  { key: "home_services", label: "Home Services", description: "Cook, maid, driver" },
  { key: "utilities", label: "Utilities", description: "Rent, bills, recharges" },
  { key: "financial", label: "Financial", description: "EMI, SIP, loans" },
  { key: "education", label: "Education", description: "School, tuition, courses" },
  { key: "other", label: "Other", description: "Miscellaneous recurring" },
];

export interface RecurringTemplate {
  id: string;
  name: string;
  hindiName?: string;
  category: CategoryKey;
  group: TemplateGroup;
  suggestedFrequency: Frequency;
  icon: LucideIcon;
  suggestedAmount?: number;
}

export const RECURRING_TEMPLATES: RecurringTemplate[] = [
  {
    id: "health-insurance",
    name: "Health Insurance",
    hindiName: "स्वास्थ्य बीमा",
    category: "Insurance",
    group: "insurance",
    suggestedFrequency: "yearly",
    icon: HeartPulse,
  },
  {
    id: "life-insurance",
    name: "Life Insurance",
    hindiName: "जीवन बीमा",
    category: "Insurance",
    group: "insurance",
    suggestedFrequency: "yearly",
    icon: Shield,
  },
  {
    id: "vehicle-insurance",
    name: "Vehicle Insurance",
    hindiName: "वाहन बीमा",
    category: "Insurance",
    group: "insurance",
    suggestedFrequency: "yearly",
    icon: Car,
  },
  {
    id: "home-insurance",
    name: "Home Insurance",
    hindiName: "गृह बीमा",
    category: "Insurance",
    group: "insurance",
    suggestedFrequency: "yearly",
    icon: Home,
  },
  {
    id: "netflix",
    name: "Netflix",
    category: "Entertainment",
    group: "subscriptions",
    suggestedFrequency: "monthly",
    icon: Tv,
    suggestedAmount: 649,
  },
  {
    id: "spotify",
    name: "Spotify",
    category: "Entertainment",
    group: "subscriptions",
    suggestedFrequency: "monthly",
    icon: Music,
    suggestedAmount: 119,
  },
  {
    id: "amazon-prime",
    name: "Amazon Prime",
    category: "Entertainment",
    group: "subscriptions",
    suggestedFrequency: "yearly",
    icon: Film,
    suggestedAmount: 1499,
  },
  {
    id: "hotstar",
    name: "Disney+ Hotstar",
    category: "Entertainment",
    group: "subscriptions",
    suggestedFrequency: "yearly",
    icon: Tv,
    suggestedAmount: 899,
  },
  {
    id: "youtube-premium",
    name: "YouTube Premium",
    category: "Entertainment",
    group: "subscriptions",
    suggestedFrequency: "monthly",
    icon: Film,
    suggestedAmount: 129,
  },
  {
    id: "gym",
    name: "Gym Membership",
    hindiName: "जिम",
    category: "Health",
    group: "subscriptions",
    suggestedFrequency: "monthly",
    icon: Dumbbell,
  },
  {
    id: "newspaper",
    name: "Newspaper",
    hindiName: "अखबार",
    category: "Subscriptions",
    group: "subscriptions",
    suggestedFrequency: "monthly",
    icon: Newspaper,
  },
  {
    id: "cook",
    name: "Cook",
    hindiName: "रसोइया",
    category: "Home Services",
    group: "home_services",
    suggestedFrequency: "monthly",
    icon: CookingPot,
  },
  {
    id: "maid",
    name: "Maid / House Help",
    hindiName: "नौकरानी",
    category: "Home Services",
    group: "home_services",
    suggestedFrequency: "monthly",
    icon: Sparkles,
  },
  {
    id: "driver",
    name: "Driver",
    hindiName: "ड्राइवर",
    category: "Home Services",
    group: "home_services",
    suggestedFrequency: "monthly",
    icon: Car,
  },
  {
    id: "milkman",
    name: "Milk",
    hindiName: "दूध",
    category: "Home Services",
    group: "home_services",
    suggestedFrequency: "monthly",
    icon: Droplets,
  },
  {
    id: "laundry",
    name: "Laundry / Dhobi",
    hindiName: "धोबी",
    category: "Home Services",
    group: "home_services",
    suggestedFrequency: "monthly",
    icon: Sparkles,
  },
  {
    id: "rent",
    name: "Rent",
    hindiName: "किराया",
    category: "Housing",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Building2,
  },
  {
    id: "wifi",
    name: "WiFi / Broadband",
    hindiName: "वाईफाई",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Wifi,
  },
  {
    id: "mobile-recharge",
    name: "Mobile Recharge",
    hindiName: "मोबाइल रिचार्ज",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Smartphone,
  },
  {
    id: "electricity",
    name: "Electricity Bill",
    hindiName: "बिजली बिल",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Zap,
  },
  {
    id: "gas",
    name: "Gas / LPG",
    hindiName: "गैस",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Flame,
  },
  {
    id: "dth",
    name: "DTH / Cable TV",
    hindiName: "डीटीएच",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Satellite,
  },
  {
    id: "water",
    name: "Water Bill",
    hindiName: "पानी बिल",
    category: "Utilities",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Droplets,
  },
  {
    id: "society-maintenance",
    name: "Society Maintenance",
    hindiName: "सोसायटी मेंटेनेंस",
    category: "Housing",
    group: "utilities",
    suggestedFrequency: "monthly",
    icon: Building2,
  },
  {
    id: "home-loan-emi",
    name: "Home Loan EMI",
    hindiName: "होम लोन EMI",
    category: "Financial",
    group: "financial",
    suggestedFrequency: "monthly",
    icon: Home,
  },
  {
    id: "car-loan-emi",
    name: "Car Loan EMI",
    hindiName: "कार लोन EMI",
    category: "Financial",
    group: "financial",
    suggestedFrequency: "monthly",
    icon: Car,
  },
  {
    id: "personal-loan-emi",
    name: "Personal Loan EMI",
    hindiName: "पर्सनल लोन EMI",
    category: "Financial",
    group: "financial",
    suggestedFrequency: "monthly",
    icon: Landmark,
  },
  {
    id: "credit-card-bill",
    name: "Credit Card Bill",
    hindiName: "क्रेडिट कार्ड बिल",
    category: "Financial",
    group: "financial",
    suggestedFrequency: "monthly",
    icon: CreditCard,
  },
  {
    id: "sip",
    name: "SIP / Mutual Fund",
    hindiName: "SIP",
    category: "Financial",
    group: "financial",
    suggestedFrequency: "monthly",
    icon: PiggyBank,
  },
  {
    id: "school-fees",
    name: "School Fees",
    hindiName: "स्कूल फीस",
    category: "Education",
    group: "education",
    suggestedFrequency: "quarterly",
    icon: GraduationCap,
  },
  {
    id: "tuition",
    name: "Tuition / Coaching",
    hindiName: "ट्यूशन",
    category: "Education",
    group: "education",
    suggestedFrequency: "monthly",
    icon: GraduationCap,
  },
  {
    id: "daycare",
    name: "Daycare / Creche",
    hindiName: "डेकेयर",
    category: "Education",
    group: "education",
    suggestedFrequency: "monthly",
    icon: Baby,
  },
];

export const getTemplatesByGroup = (group: TemplateGroup): RecurringTemplate[] =>
  RECURRING_TEMPLATES.filter((t) => t.group === group);

export const getFrequencyDays = (frequency: Frequency): number => {
  const option = FREQUENCY_OPTIONS.find((f) => f.key === frequency);
  return option?.days ?? 30;
};

export const calculateNextDueDate = (
  fromDate: number,
  frequency: Frequency
): number => {
  const date = new Date(fromDate);

  switch (frequency) {
    case "daily":
      date.setDate(date.getDate() + 1);
      break;
    case "weekly":
      date.setDate(date.getDate() + 7);
      break;
    case "biweekly":
      date.setDate(date.getDate() + 14);
      break;
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "halfyearly":
      date.setMonth(date.getMonth() + 6);
      break;
    case "yearly":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.getTime();
};

export const isDueSoon = (nextDue: number, withinDays = 5): boolean => {
  const now = Date.now();
  const daysUntilDue = (nextDue - now) / (1000 * 60 * 60 * 24);
  return daysUntilDue >= 0 && daysUntilDue <= withinDays;
};

export const isOverdue = (nextDue: number): boolean => {
  return nextDue < Date.now();
};
