"use client";

import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AppState } from "@/src/types";
import { ERROR_MESSAGES } from "@/src/utils/error";

interface IncomingPair {
  session_id: string;
  from_device_id: string;
  from_display_name: string;
}

interface AppContextValue extends AppState {
  setIsRecording: (value: boolean) => void;
  setActiveTab: (tab: "personal" | "household") => void;
  incomingPair: IncomingPair | null;
  setIncomingPair: (pair: IncomingPair | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTabState] = useState<"personal" | "household">("personal");
  const [incomingPair, setIncomingPair] = useState<IncomingPair | null>(null);

  // Wrap setActiveTab with logging
  const setActiveTab = useCallback((tab: "personal" | "household") => {
    console.log(`[AppContext] ${new Date().toISOString()} SET_ACTIVE_TAB: ${activeTab} -> ${tab}`);
    setActiveTabState(tab);
  }, [activeTab]);

  const value = useMemo<AppContextValue>(
    () => ({
      isRecording,
      setIsRecording,
      activeTab,
      setActiveTab,
      incomingPair,
      setIncomingPair,
    }),
    [isRecording, activeTab, setActiveTab, incomingPair, setIncomingPair]
  );

  console.log(`[AppContext] ${new Date().toISOString()} CONTEXT_VALUE: activeTab=${activeTab}`);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
  }
  return ctx;
};
