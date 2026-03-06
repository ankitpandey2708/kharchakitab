"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Flame } from "lucide-react";

interface StreakBadgeProps {
  count: number;
  broke: boolean;
  lostCount: number;
}

function getMilestone(count: number): {
  color: string;
  glowColor: string;
  bgColor: string;
} {
  if (count >= 100)
    return {
      color: "text-amber-500",
      glowColor: "shadow-amber-400/40",
      bgColor: "bg-amber-500/12",
    };
  if (count >= 30)
    return {
      color: "text-slate-400",
      glowColor: "shadow-slate-300/30",
      bgColor: "bg-slate-400/10",
    };
  if (count >= 7)
    return {
      color: "text-orange-700",
      glowColor: "shadow-orange-600/20",
      bgColor: "bg-orange-700/10",
    };
  return {
    color: "text-[var(--kk-ember)]",
    glowColor: "",
    bgColor: "bg-[var(--kk-ember)]/8",
  };
}

export const StreakBadge = React.memo(
  ({ count, broke, lostCount }: StreakBadgeProps) => {
    const [mounted, setMounted] = useState(false);
    const displayCount = broke ? lostCount : count;

    useEffect(() => {
      setMounted(true);
    }, []);

    if (displayCount === 0 && !broke) return null;

    const { color, glowColor, bgColor } = getMilestone(displayCount);

    // Render static version on server to avoid hydration mismatch
    if (!mounted) {
      return (
        <div
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${bgColor} ${!broke && glowColor ? `shadow-sm ${glowColor}` : ""}`}
        >
          <Flame className={`h-3.5 w-3.5 ${color}`} strokeWidth={2.5} />
          <span
            className={`text-xs font-bold ${color} font-[family:var(--font-mono)] tabular-nums`}
          >
            {displayCount}
          </span>
        </div>
      );
    }

    return (
      <AnimatePresence mode="wait">
        {broke ? (
          <motion.div
            key="broke"
            // Scale up to draw attention, hold, then collapse
            initial={{ scale: 1, opacity: 1 }}
            animate={{
              scale: [1, 1.6, 1.5, 1.5, 1.2, 0.5, 0],
              opacity: [1, 1, 1, 1, 0.8, 0.3, 0],
            }}
            transition={{
              duration: 3,
              // 0s: normal → 0.4s: pop up big → 0.9s-1.5s: hold big → 2.1s+: collapse
              times: [0, 0.12, 0.2, 0.5, 0.7, 0.88, 1],
              ease: "easeInOut",
            }}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${bgColor}`}
          >
            {/* Flame: colored -> grey */}
            <motion.div
              initial={{ filter: "grayscale(0) brightness(1)" }}
              animate={{
                filter: [
                  "grayscale(0) brightness(1)",
                  "grayscale(0) brightness(1)",
                  "grayscale(0.6) brightness(0.7)",
                  "grayscale(1) brightness(0.5)",
                ],
              }}
              transition={{ duration: 2.5, times: [0, 0.4, 0.7, 1] }}
            >
              <Flame
                className={`h-3.5 w-3.5 ${color}`}
                strokeWidth={2.5}
              />
            </motion.div>

            {/* Count with strikethrough */}
            <span className="relative">
              <span
                className={`text-xs font-bold ${color} font-[family:var(--font-mono)] tabular-nums`}
              >
                {lostCount}
              </span>
              {/* Red line strikes through the number */}
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 1, duration: 0.3, ease: "easeOut" }}
                className="absolute left-0 right-0 top-1/2 h-[1.5px] origin-left bg-[var(--kk-danger)]"
              />
            </span>
          </motion.div>
        ) : (
          <motion.div
            key={`streak-${count}`}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${bgColor} ${glowColor ? `shadow-sm ${glowColor}` : ""}`}
          >
            <Flame className={`h-3.5 w-3.5 ${color}`} strokeWidth={2.5} />
            <span
              className={`text-xs font-bold ${color} font-[family:var(--font-mono)] tabular-nums`}
            >
              {count}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

StreakBadge.displayName = "StreakBadge";
