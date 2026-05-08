import type { Recurring_template } from "@/src/types";
import type { Frequency } from "@/src/config/recurring";
import { formatCurrency } from "@/src/utils/money";

const RRULE_MAP: Record<Frequency, string> = {
  monthly: "FREQ=MONTHLY",
  quarterly: "FREQ=MONTHLY;INTERVAL=3",
  yearly: "FREQ=YEARLY",
};

const PAYMENT_LABELS: Record<string, string> = {
  upi: "UPI",
  cash: "Cash",
  card: "Card",
  unknown: "Other",
};

/** YYYYMMDD in local time — correct for all-day VALUE=DATE events */
const toICSDate = (timestamp: number): string => {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

const buildGoogleCalendarURL = (template: Recurring_template, currencySymbol: string): string => {
  const title = `${template.item} – ${currencySymbol}${formatCurrency(template.amount)}`;
  const payment = PAYMENT_LABELS[template.paymentMethod] ?? template.paymentMethod;
  const details = `Category: ${template.category}\nPayment: ${payment}`;

  const dtstart = toICSDate(template.recurring_start_date);
  // Google all-day events use exclusive end date (next day)
  const endDate = new Date(template.recurring_start_date);
  endDate.setDate(endDate.getDate() + 1);
  const dtend = toICSDate(endDate.getTime());

  const rrule = `RRULE:${RRULE_MAP[template.recurring_frequency]};UNTIL=${toICSDate(template.recurring_end_date)}`;

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${dtstart}/${dtend}`,
    recur: rrule,
    details,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const openGoogleCalendar = (template: Recurring_template, currencySymbol: string): void => {
  window.open(buildGoogleCalendarURL(template, currencySymbol), "_blank");
};
