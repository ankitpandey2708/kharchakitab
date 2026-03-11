"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Bell,
  BellOff,
  CalendarClock,
  Moon,
  Coins,
  Volume2,
  Smartphone,
  Check,
  Pencil,
} from "lucide-react";
import { CurrencyToggle } from "@/src/components/CurrencyToggle";
import { SoundToggle } from "@/src/components/SoundToggle";
import { DailyReminderToggle } from "@/src/components/DailyReminderToggle";
import { RecurringAlertsToggle } from "@/src/components/RecurringAlertsToggle";
import { getDeviceIdentity, setDeviceDisplayName, getPairings } from "@/src/db/db";
import { useSignaling } from "@/src/context/SignalingContext";
import type { DeviceIdentity } from "@/src/types";
import {
  getMasterEnabled,
  setMasterEnabled,
  ensureNotificationsEnabled,
  getBrowserPermissionHint,
  sendTestNotification,
} from "@/src/services/notifications";
import posthog from "posthog-js";

const TOGGLE_OPTIONS = [
  { value: "true", label: "On" },
  { value: "false", label: "Off" },
] as const;

/* ── Inline setting row: icon + label on left, toggle on right ── */

const SettingRow = ({
  icon,
  label,
  description,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
}) => (
  <div className="flex items-center justify-between gap-3 py-1.5">
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{ color: "var(--kk-ash)" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <span className="text-[11.5px] font-semibold" style={{ color: "var(--kk-ink)" }}>
          {label}
        </span>
        {description && (
          <p className="text-[9.5px] leading-tight mt-0.5" style={{ color: "var(--kk-ash)" }}>
            {description}
          </p>
        )}
      </div>
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

/* ── Master notification toggle (special: ember/ash pill) ── */

const MasterNotificationToggle = React.memo(() => {
  const [enabled, setEnabled] = useState(() => getMasterEnabled());
  const [hint, setHint] = useState<string | null>(null);

  const toggle = useCallback(async (value: string) => {
    const on = value === "true";

    if (on) {
      const permission = await ensureNotificationsEnabled();
      if (permission !== "granted") return;
      setEnabled(true);
      setHint(null);
      await sendTestNotification();
      posthog.capture("master_notifications_toggled", { enabled: true });
    } else {
      setMasterEnabled(false);
      setEnabled(false);
      setHint(getBrowserPermissionHint());
      posthog.capture("master_notifications_toggled", { enabled: false });
    }
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <motion.div
            className="flex-shrink-0"
            animate={{
              color: enabled ? "var(--kk-ember)" : "var(--kk-ash)",
            }}
            transition={{ duration: 0.2 }}
          >
            {enabled ? (
              <Bell className="h-3.5 w-3.5" />
            ) : (
              <BellOff className="h-3.5 w-3.5" />
            )}
          </motion.div>
          <span className="text-[11.5px] font-semibold" style={{ color: "var(--kk-ink)" }}>
            Notifications
          </span>
        </div>

        <div
          className="relative inline-flex items-center rounded-full border border-[var(--kk-smoke-heavy)] bg-white/80 p-[2px]"
          role="radiogroup"
          aria-label="Notifications"
        >
          <motion.div
            className="absolute top-[2px] bottom-[2px] rounded-full"
            style={{
              width: "calc(50% - 2px)",
              background: enabled
                ? "linear-gradient(135deg, var(--kk-ember) 0%, var(--kk-ember-deep) 100%)"
                : "linear-gradient(135deg, var(--kk-ash) 0%, #888 100%)",
              boxShadow: enabled
                ? "0 1px 4px rgba(255, 107, 53, 0.3)"
                : "0 1px 4px rgba(107, 107, 107, 0.2)",
              left: "2px",
            }}
            animate={{ x: enabled ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          />

          {TOGGLE_OPTIONS.map(({ value, label }) => {
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
      </div>

      {/* Browser permission hint when master is off */}
      <AnimatePresence>
        {hint && !enabled && (
          <motion.p
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-[10px] leading-tight"
            style={{ color: "var(--kk-ash)" }}
          >
            {hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
});

MasterNotificationToggle.displayName = "MasterNotificationToggle";

/* ── Divider ── */

const SectionDivider = () => (
  <div
    className="my-1.5"
    style={{
      height: "1px",
      background:
        "linear-gradient(90deg, transparent, var(--kk-smoke-heavy), transparent)",
    }}
  />
);

/* ── Section header ── */

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    className="kk-label pt-1 pb-0.5"
    style={{ fontSize: "9px", letterSpacing: "0.2em" }}
  >
    {children}
  </div>
);

/* ── Device name row ── */

const DeviceNameRow = React.memo(() => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { refreshPresence, client } = useSignaling();

  useEffect(() => {
    void getDeviceIdentity().then((d) => {
      setIdentity(d);
      setDraft(d.display_name);
    });
  }, []);

  const save = useCallback(async () => {
    if (!draft.trim()) return;
    const newName = draft.trim();
    await setDeviceDisplayName(newName);
    posthog.capture("display_name_changed");
    // Re-announce presence with the new name so other devices see the update
    // Pass newName directly to avoid race condition with cached identity
    await refreshPresence(newName);
    // Notify paired devices about the name change
    const pairings = await getPairings();
    if (client && pairings.length > 0) {
      const identity = await getDeviceIdentity();
      for (const pairing of pairings) {
        client.send("pairing:name_changed", {
          from_device_id: identity.device_id,
          to_device_id: pairing.partner_device_id,
          new_display_name: newName,
        });
      }
    }
    const updated = await getDeviceIdentity();
    setIdentity(updated);
    setIsEditing(false);
  }, [draft, refreshPresence, client]);

  return (
    <SettingRow icon={<Smartphone className="h-3 w-3" />} label="Your Name" description="Tap to rename">
      {isEditing ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            className="w-24 bg-transparent text-[11px] font-semibold text-[var(--kk-ink)] focus:outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <button onClick={save} className="shrink-0 rounded-full p-0.5 text-[var(--kk-sage)] hover:bg-[var(--kk-sage-bg)]">
            <Check className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[var(--kk-ink)] hover:text-[var(--kk-ember)] transition-colors max-w-[110px]"
        >
          <span className="truncate">{identity?.display_name || "—"}</span>
          <Pencil className="h-2.5 w-2.5 text-[var(--kk-ash)] shrink-0" />
        </button>
      )}
    </SettingRow>
  );
});

DeviceNameRow.displayName = "DeviceNameRow";

/* ── Main popover ── */

export const SettingsPopover = React.memo(() => {
  const [isOpen, setIsOpen] = useState(false);
  const [masterOn, setMasterOn] = useState(() => getMasterEnabled());
  const ref = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  useEffect(() => {
    if (isOpen) setMasterOn(getMasterEnabled());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setMasterOn(getMasterEnabled());
    }, 500);
    return () => clearInterval(interval);
  }, [isOpen]);

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
      <motion.button
        type="button"
        onClick={toggle}
        aria-label="Settings"
        aria-expanded={isOpen}
        data-tour="notifications-toggle"
        className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm"
        whileHover={{ rotate: 45, color: "var(--kk-ember)" }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        <Settings className="h-4 w-4" />
      </motion.button>

      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -6 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute right-0 top-full mt-2 w-[min(260px,calc(100vw-2rem))] overflow-hidden rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-white/90 shadow-[var(--kk-shadow-lg)] backdrop-blur-xl transform-gpu will-change-[transform,opacity]"
          >
            {/* Ink-line accent */}
            <div
              className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-full"
              style={{
                background:
                  "linear-gradient(180deg, var(--kk-ember), var(--kk-saffron))",
              }}
            />

            <div className="px-4 py-3 pl-5 space-y-0.5">
              {/* ── Alerts section ── */}
              <SectionHeader>Alerts</SectionHeader>

              <MasterNotificationToggle />

              {/* Sub-toggles when master is on */}
              <AnimatePresence>
                {masterOn && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="ml-[18px] border-l-2 pl-2.5 py-0.5"
                      style={{ borderColor: "var(--kk-smoke-heavy)" }}
                    >
                      <SettingRow
                        icon={<CalendarClock className="h-3 w-3" />}
                        label="Bill Reminders"
                        description="Before recurring bills are due"
                      >
                        <RecurringAlertsToggle />
                      </SettingRow>

                      <SettingRow
                        icon={<Moon className="h-3 w-3" />}
                        label="Evening Recap"
                        description="Daily spending summary"
                      >
                        <DailyReminderToggle />
                      </SettingRow>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <SectionDivider />

              {/* ── Preferences section ── */}
              <SectionHeader>Preferences</SectionHeader>

              <DeviceNameRow />

              <SettingRow
                icon={<Coins className="h-3.5 w-3.5" />}
                label="Currency"
              >
                <CurrencyToggle />
              </SettingRow>

              <SettingRow
                icon={<Volume2 className="h-3.5 w-3.5" />}
                label="Sound"
              >
                <SoundToggle />
              </SettingRow>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

SettingsPopover.displayName = "SettingsPopover";
