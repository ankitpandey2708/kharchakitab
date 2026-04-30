// PERF-RERENDER: Split from AppContext - isolated currency state to prevent re-renders when other app state changes

"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CurrencyCode } from "@/src/utils/money";
import { detectCurrency } from "@/src/utils/money";
import { ERROR_MESSAGES } from "@/src/utils/error";
import { LS } from "@/src/config/storageKeys";

const getInitialCurrency = (): CurrencyCode => {
    if (typeof window === "undefined") return "INR";
    const stored = localStorage.getItem(LS.CURRENCY);
    if (stored === "INR" || stored === "USD") return stored;
    return detectCurrency();
};

interface CurrencyContextValue {
    currency: CurrencyCode;
    setCurrency: (code: CurrencyCode) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
    const [currency, setCurrencyState] = useState<CurrencyCode>(getInitialCurrency);

    const setCurrency = useCallback((code: CurrencyCode) => {
        setCurrencyState(code);
        localStorage.setItem(LS.CURRENCY, code);
    }, []);

    // Persist initial auto-detected value
    useEffect(() => {
        if (!localStorage.getItem(LS.CURRENCY)) {
            localStorage.setItem(LS.CURRENCY, currency);
        }
    }, [currency]);

    const value = useMemo<CurrencyContextValue>(
        () => ({
            currency,
            setCurrency,
        }),
        [currency, setCurrency]
    );

    return (
        <CurrencyContext.Provider value={value}>
            {children}
        </CurrencyContext.Provider>
    );
};

export const useCurrencyContext = () => {
    const ctx = useContext(CurrencyContext);
    if (!ctx) {
        throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
    }
    return ctx;
};
