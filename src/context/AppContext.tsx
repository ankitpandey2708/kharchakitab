"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import type { AppState } from "@/src/types";
import { ERROR_MESSAGES } from "@/src/utils/error";

interface AppContextValue extends AppState {
  setIsRecording: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [isRecording, setIsRecording] = useState(false);

  const value = useMemo<AppContextValue>(
    () => ({
      isRecording,
      setIsRecording,
    }),
    [isRecording]
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
