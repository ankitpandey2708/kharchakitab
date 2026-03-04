"use client";

import React from "react";
import { motion } from "framer-motion";
import { useCurrency } from "@/src/hooks/useCurrency";
import type { CurrencyCode } from "@/src/utils/money";

const OPTIONS: { code: CurrencyCode; label: string }[] = [
  { code: "INR", label: "₹" },
  { code: "USD", label: "$" },
];

export const CurrencyToggle = React.memo(() => {
  const { code, setCurrency } = useCurrency();

  return (
    <div
      className="relative inline-flex items-center rounded-full border border-[var(--kk-smoke-heavy)] bg-white/80 p-[2px]"
      role="radiogroup"
      aria-label="Currency"
    >
      {/* Sliding ember indicator - PERF-ANIMATION: Changed from 'left' to 'x' transform */}
      <motion.div
        className="absolute top-[2px] bottom-[2px] rounded-full"
        style={{
          width: "calc(50% - 2px)",
          background: "linear-gradient(135deg, var(--kk-ember) 0%, var(--kk-ember-deep) 100%)",
          boxShadow: "0 1px 4px rgba(255, 107, 53, 0.3)",
          left: "2px", // Fixed position, use transform for animation
        }}
        // PERF-ANIMATION: Using translateX instead of left for GPU acceleration
        animate={{
          x: code === "INR" ? 0 : "100%",
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 35,
        }}
      />

      {OPTIONS.map(({ code: optCode, label }) => {
        const isActive = code === optCode;
        return (
          <button
            key={optCode}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setCurrency(optCode)}
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

CurrencyToggle.displayName = "CurrencyToggle";
