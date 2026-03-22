// PERF-RERENDER: Updated to use split CurrencyContext instead of monolithic AppContext for better performance isolation

"use client";

import { useCallback, useMemo } from "react";
import { useCurrencyContext } from "@/src/context/CurrencyContext";
import { getCurrency, formatCurrency as formatCurrencyUtil } from "@/src/utils/money";

export const useCurrency = () => {
  const { currency, setCurrency } = useCurrencyContext();

  // Memoize config to prevent unnecessary re-renders in consuming components
  const config = useMemo(() => getCurrency(currency), [currency]);

  const formatCurrency = useCallback(
    (value: number, options?: Intl.NumberFormatOptions) =>
      formatCurrencyUtil(value, config.locale, options),
    [config.locale]
  );

  return useMemo(() => ({
    code: config.code,
    symbol: config.symbol,
    locale: config.locale,
    setCurrency,
    formatCurrency,
  }), [config.code, config.symbol, config.locale, setCurrency, formatCurrency]);
};
