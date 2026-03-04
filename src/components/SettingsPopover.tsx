"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings } from "lucide-react";
import { CurrencyToggle } from "@/src/components/CurrencyToggle";
import { SoundToggle } from "@/src/components/SoundToggle";

export const SettingsPopover = React.memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      {/* Gear trigger — ghost icon button with hover rotation & ember shift */}
      <motion.button
        type="button"
        onClick={toggle}
        aria-label="Settings"
        aria-expanded={isOpen}
        className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm"
        whileHover={{ rotate: 45, color: "var(--kk-ember)" }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Settings className="h-4 w-4" />
      </motion.button>

      {/* Popover panel */}
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute right-0 top-full mt-2 min-w-[160px] overflow-hidden rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-white/90 shadow-[var(--kk-shadow-lg)] backdrop-blur-xl transform-gpu will-change-[transform,opacity]"
          >
            {/* Ink-line accent — ember-to-saffron gradient bar */}
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
              style={{
                background:
                  "linear-gradient(180deg, var(--kk-ember), var(--kk-saffron))",
              }}
            />

            <div className="px-4 py-3 pl-5">
              {/* Section label */}
              <motion.div
                className="kk-label mb-2"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05, duration: 0.2 }}
              >
                Currency
              </motion.div>

              {/* Toggle */}
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.2 }}
              >
                <CurrencyToggle />
              </motion.div>

              {/* Sound section */}
              <motion.div
                className="kk-label mb-2 mt-3"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15, duration: 0.2 }}
              >
                Sound
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.2 }}
              >
                <SoundToggle />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

SettingsPopover.displayName = "SettingsPopover";
