"use client";

import React, { useCallback, useState } from "react";
import { motion } from "framer-motion";
import posthog from "posthog-js";
import {
  clearAlertsQueue,
  ensureNotificationsEnabled,
  getAlertsEnabled,
  setAlertsEnabled as persistAlertsEnabled,
  syncAlertsQueue,
} from "@/src/services/notifications";
import { getRecurringTemplates } from "@/src/db/db";

const OPTIONS = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
] as const;

export const RecurringAlertsToggle = React.memo(() => {
  const [enabled, setEnabled] = useState(() => getAlertsEnabled());

  const toggle = useCallback(async (value: string) => {
    const on = value === "true";

    if (on) {
      const permission = await ensureNotificationsEnabled();
      if (permission !== "granted") return;
      persistAlertsEnabled(true);
      setEnabled(true);
      const templates = await getRecurringTemplates();
      await syncAlertsQueue(templates, { force: true });
      posthog.capture("recurring_alerts_toggled", { enabled: true });
    } else {
      persistAlertsEnabled(false);
      setEnabled(false);
      await clearAlertsQueue();
      posthog.capture("recurring_alerts_toggled", { enabled: false });
    }
  }, []);

  return (
    <div
      className="relative inline-flex items-center rounded-full border border-[var(--kk-smoke-heavy)] bg-white/80 p-[2px]"
      role="radiogroup"
      aria-label="Recurring alerts"
    >
      <motion.div
        className="absolute top-[2px] bottom-[2px] rounded-full"
        style={{
          width: "calc(50% - 2px)",
          background:
            "linear-gradient(135deg, var(--kk-ember) 0%, var(--kk-ember-deep) 100%)",
          boxShadow: "0 1px 4px rgba(255, 107, 53, 0.3)",
          left: "2px",
        }}
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

RecurringAlertsToggle.displayName = "RecurringAlertsToggle";
