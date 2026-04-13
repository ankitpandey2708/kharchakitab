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
  | "monthly"
  | "quarterly"
  | "yearly";

export const FREQUENCY_OPTIONS: {
  key: Frequency;
  label: string;
  shortLabel: string;
  days: number;
}[] = [
    { key: "monthly", label: "Monthly", shortLabel: "Monthly", days: 30 },
    { key: "quarterly", label: "Quarterly", shortLabel: "Quarterly", days: 91 },
    { key: "yearly", label: "Yearly", shortLabel: "Yearly", days: 365 },
  ];

export const FREQUENCY_LABEL_MAP: Record<Frequency, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

export interface RecurringTemplate {
  id: string;
  name: string;
  category: CategoryKey;
  suggestedFrequency: Frequency;
  icon: LucideIcon;
  suggestedAmount?: number;
}

type TemplateEntry = Omit<RecurringTemplate, "category">;

const RECURRING_TEMPLATES_BY_CATEGORY: Partial<Record<CategoryKey, TemplateEntry[]>> = {
  Insurance: [
    { id: "health-insurance", name: "Health Insurance", suggestedFrequency: "yearly", icon: HeartPulse },
    { id: "life-insurance", name: "Life Insurance", suggestedFrequency: "yearly", icon: Shield },
    { id: "vehicle-insurance", name: "Vehicle Insurance", suggestedFrequency: "yearly", icon: Car },
    { id: "home-insurance", name: "Home Insurance", suggestedFrequency: "yearly", icon: Home },
  ],
  Subscriptions: [
    { id: "gym", name: "Gym Membership", suggestedFrequency: "monthly", icon: Dumbbell },
    { id: "newspaper", name: "Newspaper", suggestedFrequency: "monthly", icon: Newspaper },
    { id: "netflix", name: "Netflix", suggestedFrequency: "monthly", icon: Tv, suggestedAmount: 649 },
    { id: "spotify", name: "Spotify", suggestedFrequency: "monthly", icon: Music, suggestedAmount: 119 },
    { id: "amazon-prime", name: "Amazon Prime", suggestedFrequency: "yearly", icon: Film, suggestedAmount: 1499 },
    { id: "hotstar", name: "Disney+ Hotstar", suggestedFrequency: "yearly", icon: Tv, suggestedAmount: 899 },
    { id: "youtube-premium", name: "YouTube Premium", suggestedFrequency: "monthly", icon: Film, suggestedAmount: 129 },
  ],
  "Home Services": [
    { id: "cook", name: "Cook", suggestedFrequency: "monthly", icon: CookingPot },
    { id: "maid", name: "Maid / House Help", suggestedFrequency: "monthly", icon: Sparkles },
    { id: "driver", name: "Driver", suggestedFrequency: "monthly", icon: Car },
    { id: "milkman", name: "Milk", suggestedFrequency: "monthly", icon: Droplets },
    { id: "laundry", name: "Laundry / Dhobi", suggestedFrequency: "monthly", icon: Sparkles },
  ],
  Bills: [
    { id: "wifi", name: "WiFi / Broadband", suggestedFrequency: "monthly", icon: Wifi },
    { id: "mobile-recharge", name: "Mobile Recharge", suggestedFrequency: "monthly", icon: Smartphone },
    { id: "electricity", name: "Electricity Bill", suggestedFrequency: "monthly", icon: Zap },
    { id: "gas", name: "Gas / LPG", suggestedFrequency: "monthly", icon: Flame },
    { id: "dth", name: "DTH / Cable TV", suggestedFrequency: "monthly", icon: Satellite },
    { id: "water", name: "Water Bill", suggestedFrequency: "monthly", icon: Droplets },
    { id: "vehicle-maintenance", name: "Vehicle Maintenance", suggestedFrequency: "yearly", icon: Car },
    { id: "rent", name: "Rent", suggestedFrequency: "monthly", icon: Building2 },
  ],
  Financial: [
    { id: "home-loan-emi", name: "Home Loan EMI", suggestedFrequency: "monthly", icon: Home },
    { id: "car-loan-emi", name: "Car Loan EMI", suggestedFrequency: "monthly", icon: Car },
    { id: "personal-loan-emi", name: "Personal Loan EMI", suggestedFrequency: "monthly", icon: Landmark },
    { id: "credit-card-bill", name: "Credit Card Bill", suggestedFrequency: "monthly", icon: CreditCard },
    { id: "sip", name: "SIP / Mutual Fund", suggestedFrequency: "monthly", icon: PiggyBank },
  ],
  Education: [
    { id: "school-fees", name: "School Fees", suggestedFrequency: "quarterly", icon: GraduationCap },
    { id: "tuition", name: "Tuition / Coaching", suggestedFrequency: "monthly", icon: GraduationCap },
    { id: "daycare", name: "Daycare / Creche", suggestedFrequency: "monthly", icon: Baby },
  ],
};

export const RECURRING_TEMPLATES: RecurringTemplate[] = Object.entries(RECURRING_TEMPLATES_BY_CATEGORY).flatMap(
  ([category, templates]) => templates!.map((t) => ({ ...t, category: category as CategoryKey }))
);

export const calculateNextDueDate = (
  fromDate: number,
  frequency: Frequency
): number => {
  const date = new Date(fromDate);

  switch (frequency) {
    case "monthly":
      date.setMonth(date.getMonth() + 1);
      break;
    case "quarterly":
      date.setMonth(date.getMonth() + 3);
      break;
    case "yearly":
      date.setFullYear(date.getFullYear() + 1);
      break;
  }

  return date.getTime();
};

export const getNextUpcomingDueDate = (
  fromDate: number,
  frequency: Frequency,
  now = Date.now(),
  endDate?: number
): number => {
  let nextDue = fromDate;
  let guard = 0;
  const maxIterations = 1200;

  while (nextDue < now && guard < maxIterations) {
    nextDue = calculateNextDueDate(nextDue, frequency);
    guard += 1;
    if (endDate && nextDue > endDate) {
      return endDate;
    }
  }

  return nextDue;
};

export const isDueSoon = (nextDue: number, withinDays = 5): boolean => {
  const now = Date.now();
  const daysUntilDue = (nextDue - now) / (1000 * 60 * 60 * 24);
  return daysUntilDue >= 0 && daysUntilDue <= withinDays;
};

