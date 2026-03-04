// PERF-RERENDER: Refactored from monolithic context to composite provider using split contexts (RecordingContext, NavigationContext, CurrencyContext, PairingContext)
// This prevents unnecessary re-renders when only one piece of state changes

"use client";

import React from "react";
import { RecordingProvider } from "./RecordingContext";
import { NavigationProvider } from "./NavigationContext";
import { CurrencyProvider } from "./CurrencyContext";
import { PairingProvider } from "./PairingContext";

// Re-export all hooks for backward compatibility
export { useRecording } from "./RecordingContext";
export { useNavigation } from "./NavigationContext";
export { usePairing } from "./PairingContext";

// Composite provider that wraps all split contexts
export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <RecordingProvider>
      <NavigationProvider>
        <CurrencyProvider>
          <PairingProvider>
            {children}
          </PairingProvider>
        </CurrencyProvider>
      </NavigationProvider>
    </RecordingProvider>
  );
};

// Legacy hook for backward compatibility - prefer specific hooks for better performance
export const useAppContext = () => {
  // Import dynamically to avoid circular dependencies
  const { useRecording: useRec } = require("./RecordingContext");
  const { useNavigation: useNav } = require("./NavigationContext");
  const { useCurrencyContext: useCurr } = require("./CurrencyContext");
  const { usePairing: usePair } = require("./PairingContext");

  const recording = useRec();
  const navigation = useNav();
  const currency = useCurr();
  const pairing = usePair();

  return {
    // Recording
    isRecording: recording.isRecording,
    setIsRecording: recording.setIsRecording,
    // Navigation
    activeTab: navigation.activeTab,
    setActiveTab: navigation.setActiveTab,
    // Currency
    currency: currency.currency,
    setCurrency: currency.setCurrency,
    // Pairing
    incomingPair: pairing.incomingPair,
    setIncomingPair: pairing.setIncomingPair,
  };
};
