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

  const setActiveTab = useCallback((tab: "personal" | "household") => {
    setActiveTabState(tab);
  }, []);

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


  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error(ERROR_MESSAGES.useAppContextMustBeWithinProvider);
  }
  return ctx;
};
