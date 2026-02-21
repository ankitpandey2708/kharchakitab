export const formatCurrency = (
  value: number,
  options: Intl.NumberFormatOptions = {}
) =>
  value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    ...options,
  });

export const normalizeAmount = (value: number) => {
  if (!Number.isFinite(value)) return value;
  return Math.round(value * 100) / 100;
};
