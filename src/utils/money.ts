export type CurrencyCode = "INR" | "USD";

interface CurrencyConfig {
  symbol: string;
  locale: string;
  code: CurrencyCode;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  INR: { symbol: "₹", locale: "en-IN", code: "INR" },
  USD: { symbol: "$", locale: "en-US", code: "USD" },
};

export const getCurrency = (code: CurrencyCode): CurrencyConfig =>
  CURRENCIES[code] ?? CURRENCIES.INR;

export const detectCurrency = (): CurrencyCode => {
  if (typeof navigator === "undefined" || typeof Intl === "undefined") return "INR";

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") {
      return "INR";
    }
  } catch (e) {
    // Fallback if Intl is not supported or fails
  }

  const lang = navigator.language || "";
  return lang.includes("IN") ? "INR" : "USD";
};

export const formatCurrency = (
  value: number,
  locale: string = "en-IN",
  options: Intl.NumberFormatOptions = {}
) =>
  value.toLocaleString(locale, {
    maximumFractionDigits: 2,
    ...options,
  });

export const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 100) / 100;
};
