// PERF-RERENDER: Split from AppContext - isolated recording state to prevent unnecessary re-renders in non-recording components

"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ERROR_MESSAGES } from "@/src/utils/error";

interface RecordingContextValue {
    isRecording: boolean;
    setIsRecording: (value: boolean) => void;
}

const RecordingContext = createContext<RecordingContextValue | null>(null);

export const RecordingProvider = ({ children }: { children: React.ReactNode }) => {
    const [isRecording, setIsRecordingState] = useState(false);

    const setIsRecording = useCallback((value: boolean) => {
        setIsRecordingState(value);
    }, []);

    const value = useMemo<RecordingContextValue>(
        () => ({
            isRecording,
            setIsRecording,
        }),
        [isRecording, setIsRecording]
    );

    return (
        <RecordingContext.Provider value={value}>
            {children}
        </RecordingContext.Provider>
    );
};

export const useRecording = () => {
    const ctx = useContext(RecordingContext);
    if (!ctx) {
        throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
    }
    return ctx;
};
