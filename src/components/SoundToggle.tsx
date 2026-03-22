"use client";

import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";

const OPTIONS = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
] as const;

export const SoundToggle = React.memo(() => {
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("kk_sound_enabled") !== "false";
  });

  const toggle = useCallback((value: string) => {
    const on = value === "true";
    setEnabled(on);
    localStorage.setItem("kk_sound_enabled", String(on));
  }, []);

  return (
    <div
      className="relative inline-flex items-center rounded-full border border-[var(--kk-smoke-heavy)] bg-white/80 p-[2px]"
      role="radiogroup"
      aria-label="Sound"
    >
      {/* Sliding ember indicator - PERF-ANIMATION: Changed from 'left' to 'x' transform */}
      <motion.div
        className="absolute top-[2px] bottom-[2px] rounded-full"
        style={{
          width: "calc(50% - 2px)",
          background:
            "linear-gradient(135deg, var(--kk-ember) 0%, var(--kk-ember-deep) 100%)",
          boxShadow: "0 1px 4px rgba(255, 107, 53, 0.3)",
          left: "2px", // Fixed position, use transform for animation
        }}
        // PERF-ANIMATION: Using translateX instead of left for GPU acceleration
        animate={{
          x: enabled ? 0 : "100%",
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 35,
        }}
      />

      {OPTIONS.map(({ value, label }) => {
        const isActive = enabled === (value === "true");
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => toggle(value)}
            // PERF-ANIMATION: Removed transition-colors since we use transform now
            className="relative z-10 flex items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide"
            style={{
              color: isActive ? "white" : "var(--kk-ash)",
              minWidth: "26px",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
});

SoundToggle.displayName = "SoundToggle";
