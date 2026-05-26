// PERF-RERENDER: Refactored from monolithic context to composite provider using split contexts (RecordingContext, NavigationContext, CurrencyContext, PairingContext)
// This prevents unnecessary re-renders when only one piece of state changes

"use client";

import React from "react";
import { RecordingProvider, useRecording } from "./RecordingContext";
import { NavigationProvider, useNavigation } from "./NavigationContext";
import { CurrencyProvider, useCurrencyContext } from "./CurrencyContext";
import { PairingProvider, usePairing } from "./PairingContext";

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
  const recording = useRecording();
  const navigation = useNavigation();
  const currency = useCurrencyContext();
  const pairing = usePairing();

  return {
    // Recording
    isRecording: recording.isRecording,
    setIsRecording: recording.setIsRecording,
    // Navigation (AppTab: "summary" | "recurring" | "analytics" | "profile")
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
