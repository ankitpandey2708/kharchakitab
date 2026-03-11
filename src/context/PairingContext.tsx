// PERF-RERENDER: Split from AppContext - isolated pairing state to prevent re-renders during pairing flow

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ERROR_MESSAGES } from "@/src/utils/error";

interface IncomingPair {
    session_id: string;
    from_device_id: string;
    from_display_name: string;
}

interface PairingContextValue {
    incomingPair: IncomingPair | null;
    setIncomingPair: (pair: IncomingPair | null) => void;
}

const PairingContext = createContext<PairingContextValue | null>(null);

export const PairingProvider = ({ children }: { children: React.ReactNode }) => {
    const [incomingPair, setIncomingPairState] = useState<IncomingPair | null>(null);

    const setIncomingPair = useCallback((pair: IncomingPair | null) => {
        setIncomingPairState(pair);
    }, []);

    const value = useMemo<PairingContextValue>(
        () => ({
            incomingPair,
            setIncomingPair,
        }),
        [incomingPair, setIncomingPair]
    );

    return (
        <PairingContext.Provider value={value}>
            {children}
        </PairingContext.Provider>
    );
};

export const usePairing = () => {
    const ctx = useContext(PairingContext);
    if (!ctx) {
        throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
    }
    return ctx;
};
