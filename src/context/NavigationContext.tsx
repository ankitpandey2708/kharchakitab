// PERF-RERENDER: Split from AppContext - isolated navigation state to prevent re-renders on tab changes

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ERROR_MESSAGES } from "@/src/utils/error";

interface NavigationContextValue {
    activeTab: "personal" | "household";
    setActiveTab: (tab: "personal" | "household") => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export const NavigationProvider = ({ children }: { children: React.ReactNode }) => {
    const [activeTab, setActiveTabState] = useState<"personal" | "household">("personal");

    const setActiveTab = useCallback((tab: "personal" | "household") => {
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
