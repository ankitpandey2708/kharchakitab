// PERF-RERENDER: Split from AppContext - isolated navigation state to prevent re-renders on tab changes

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ERROR_MESSAGES } from "@/src/utils/error";

export type AppTab = "summary" | "recurring" | "household";

interface NavigationContextValue {
    activeTab: AppTab;
    setActiveTab: (tab: AppTab) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeTab, setActiveTabState] = useState<AppTab>("summary");

    const setActiveTab = useCallback((tab: AppTab) => {
        setActiveTabState(tab);
    }, []);

    const value = useMemo<NavigationContextValue>(
        () => ({
            activeTab,
            setActiveTab,
        }),
        [activeTab, setActiveTab]
    );

    return (
        <NavigationContext.Provider value={value}>
            {children}
        </NavigationContext.Provider>
    );
};

export const useNavigation = () => {
    const ctx = useContext(NavigationContext);
    if (!ctx) {
        throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
    }
    return ctx;
};
