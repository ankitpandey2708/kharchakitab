"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MascotMood = "idle" | "celebrate" | "wave" | "roast" | "warning" | "thinking";

interface MascotContextValue {
  currentMood: MascotMood;
  trigger: (mood: MascotMood) => void;
  setPermanentMood: (mood: MascotMood) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const MascotContext = createContext<MascotContextValue | null>(null);

export const MascotProvider = ({ children }: { children: React.ReactNode }) => {
  const [currentMood, setCurrentMood] = useState<MascotMood>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Fire a mood that auto-reverts to "idle" after the animation duration. */
  const trigger = useCallback((mood: MascotMood) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrentMood(mood);

    // Auto-revert to idle after the animation completes (~1.5s for most Rive animations)
    timeoutRef.current = setTimeout(() => {
      setCurrentMood("idle");
    }, 1800);
  }, []);

  /** Set a persistent mood (won't auto-revert). Useful for empty-state "wave". */
  const setPermanentMood = useCallback((mood: MascotMood) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCurrentMood(mood);
  }, []);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const value = useMemo<MascotContextValue>(
    () => ({ currentMood, trigger, setPermanentMood }),
    [currentMood, trigger, setPermanentMood]
  );

  return <MascotContext.Provider value={value}>{children}</MascotContext.Provider>;
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export const useMascot = (): MascotContextValue => {
  const ctx = useContext(MascotContext);
  if (!ctx) {
    throw new Error("useMascot must be used within a MascotProvider");
  }
  return ctx;
};
