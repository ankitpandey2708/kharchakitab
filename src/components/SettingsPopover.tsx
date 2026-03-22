"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Bell,
  Coins,
  Volume2,
  Smartphone,
  Check,
  Pencil,
  Users,
  ChevronRight,
  Coffee,
} from "lucide-react";
import { CurrencyToggle } from "@/src/components/CurrencyToggle";
import { SoundToggle } from "@/src/components/SoundToggle";
import { getDeviceIdentity, setDeviceDisplayName, getPairings } from "@/src/db/db";
import { useSignaling } from "@/src/context/SignalingContext";
import type { DeviceIdentity } from "@/src/types";
import posthog from "posthog-js";

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
        <span className="text-[11.5px] font-semibold whitespace-nowrap" style={{ color: "var(--kk-ink)" }}>
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

export const SettingsPopover = React.memo(({
  onOpenSync,
  onOpenNotifications
}: {
  onOpenSync?: () => void;
  onOpenNotifications?: () => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleOpenNotifications = useCallback(() => {
    setIsOpen(false);
    onOpenNotifications?.();
  }, [onOpenNotifications]);

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
            <div className="px-4 py-3 space-y-0.5">
              {/* ── Alerts section ── */}
              <SectionHeader>Alerts</SectionHeader>

              <button
                onClick={handleOpenNotifications}
                className="flex w-full items-center justify-between py-1.5 text-left group"
              >
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5" style={{ color: "var(--kk-ash)" }} />
                  <span className="text-[11.5px] font-semibold" style={{ color: "var(--kk-ink)" }}>
                    Notifications
                  </span>
                </div>
                <ChevronRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--kk-ash)" }}
                />
              </button>

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

              {onOpenSync && (
                <>
                  <SectionDivider />
                  <SectionHeader>Household</SectionHeader>
                  <button
                    onClick={() => { setIsOpen(false); onOpenSync(); }}
                    className="flex w-full items-center gap-2 py-1.5 text-left"
                  >
                    <div className="flex-shrink-0 flex items-center justify-center" style={{ color: "var(--kk-ash)" }}>
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-[11.5px] font-semibold flex-1" style={{ color: "var(--kk-ink)" }}>Sync & Pairing</span>
                    <span className="text-[10px]" style={{ color: "var(--kk-ash)" }}>›</span>
                  </button>
                </>
              )}

              <SectionDivider />
              <a
                href="https://razorpay.me/@ankitpandey2708"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => posthog.capture("buymeacoffee_clicked")}
                className="flex w-full items-center gap-2 py-1.5 text-left group"
              >
                <div className="flex-shrink-0 flex items-center justify-center" style={{ color: "var(--kk-ash)" }}>
                  <Coffee className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11.5px] font-semibold flex-1 group-hover:text-[var(--kk-ember)] transition-colors" style={{ color: "var(--kk-ink)" }}>
                  Buy me a coffee
                </span>
                <span className="text-[10px]" style={{ color: "var(--kk-ash)" }}>›</span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
});

SettingsPopover.displayName = "SettingsPopover";
