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

/** YYYYMMDDTHHMMSSz in UTC — required for DTSTAMP */
const toICSDateTimeUTC = (timestamp: number): string => {
  const d = new Date(timestamp);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${day}T${h}${min}${s}Z`;
};

/** Escape special ICS text characters per RFC 5545 §3.3.11 */
const escapeICS = (str: string): string =>
  str.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");

/**
 * Fold long lines per RFC 5545 §3.1 — max 75 octets per line,
 * continuation lines start with a single space.
 * Uses character count as approximation (works for typical ASCII/UTF-8 content).
 */
const foldLine = (line: string): string => {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  chunks.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    chunks.push(` ${line.slice(i, i + 74)}`);
    i += 74;
  }
  return chunks.join("\r\n");
};

const buildVEvent = (t: Recurring_template): string => {
  const dtstamp = toICSDateTimeUTC(Date.now());
  const rrule = `${RRULE_MAP[t.recurring_frequency]};UNTIL=${toICSDate(t.recurring_end_date)}`;
  const summary = escapeICS(`${t.item} \u2013 \u20b9${formatCurrency(t.amount)}`);
  const payment = PAYMENT_LABELS[t.paymentMethod] ?? t.paymentMethod;

  // Build description parts separately so \n is not double-escaped by escapeICS
  const descParts = [
    `Category: ${escapeICS(t.category)}`,
    `Payment: ${escapeICS(payment)}`,
  ];
  const description = descParts.join("\\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${t._id}@kharchakitab`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${toICSDate(t.recurring_start_date)}`,
    `RRULE:${rrule}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "BEGIN:VALARM",
    `TRIGGER:-P${t.recurring_reminder_days}D`,
    "ACTION:DISPLAY",
    `DESCRIPTION:Upcoming: ${escapeICS(t.item)}`,
    "END:VALARM",
    "END:VEVENT",
  ];

  return lines.map(foldLine).join("\r\n");
};

const buildICS = (templates: Recurring_template[]): string => {
  const vevents = templates.map(buildVEvent).join("\r\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KharchaKitab//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    vevents,
    "END:VCALENDAR",
  ].join("\r\n");
};

export const toICSFilename = (name: string): string =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-recurring.ics`;

export const buildGoogleCalendarURL = (template: Recurring_template): string => {
  const title = `${template.item} – ₹${formatCurrency(template.amount)}`;
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

export const openGoogleCalendar = (template: Recurring_template): void => {
  window.open(buildGoogleCalendarURL(template), "_blank");
};

export const downloadICS = (
  templates: Recurring_template | Recurring_template[],
  filename: string
): void => {
  const list = Array.isArray(templates) ? templates : [templates];
  const content = buildICS(list);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  // iOS Safari: open in new tab so the OS triggers "Open in Calendar"
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (isIOS) {
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
};
