"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Bell,
    CalendarClock,
    Moon,
    AudioLines,
    Clock,
    Info,
    ArrowLeft,
} from "lucide-react";
import { DailyReminderToggle } from "@/src/components/DailyReminderToggle";
import { RecurringAlertsToggle } from "@/src/components/RecurringAlertsToggle";
import { MannKiBaatToggle } from "@/src/components/MannKiBaatToggle";
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

/* ── Notification Category Section ── */

interface NotificationItem {
    id: string;
    icon: React.ReactNode;
    label: string;
    description: string;
    toggle: React.ReactNode;
    time?: string;
}

interface CategorySectionProps {
    title: string;
    items: NotificationItem[];
}

const CategorySection = ({ title, items }: CategorySectionProps) => (
    <div className="mb-6">
        <h3
            className="text-[10px] font-semibold uppercase tracking-wider mb-3 px-1"
            style={{ color: "var(--kk-ash)" }}
        >
            {title}
        </h3>
        <div
            className="kk-card overflow-hidden"
            style={{
                borderColor: "var(--kk-smoke)",
            }}
        >
            {items.map((item, index) => (
                <div
                    key={item.id}
                    className={`p-4 ${index !== items.length - 1 ? "border-b" : ""}`}
                    style={{
                        borderColor: "var(--kk-smoke)",
                    }}
                >
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                            <div
                                className="flex-shrink-0 mt-0.5"
                                style={{ color: "var(--kk-ash)" }}
                            >
                                {item.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                        className="text-[14px] font-semibold"
                                        style={{ color: "var(--kk-ink)" }}
                                    >
                                        {item.label}
                                    </span>
                                    {item.time && (
                                        <span
                                            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                                            style={{
                                                color: "var(--kk-ash)",
                                                background: "var(--kk-smoke)",
                                            }}
                                        >
                                            <Clock className="h-2.5 w-2.5" />
                                            {item.time}
                                        </span>
                                    )}
                                </div>
                                <p
                                    className="text-[12px] leading-relaxed mt-1.5"
                                    style={{ color: "var(--kk-ash)" }}
                                >
                                    {item.description}
                                </p>
                            </div>
                        </div>
                        <div className="flex-shrink-0">{item.toggle}</div>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

/* ── Master Toggle Component ── */

const MasterToggle = React.memo(
    ({
        enabled,
        onChange,
    }: {
        enabled: boolean;
        onChange: (enabled: boolean) => void;
    }) => {
        const [hint, setHint] = useState<string | null>(null);

        const toggle = useCallback(
            async (value: string) => {
                const on = value === "true";

                if (on) {
                    const permission = await ensureNotificationsEnabled();
                    if (permission !== "granted") return;
                    onChange(true);
                    setHint(null);
                    // Send a test notification to confirm it's working
                    await sendTestNotification();
                    posthog.capture("master_notifications_toggled", { enabled: true });
                } else {
                    setMasterEnabled(false);
                    onChange(false);
                    setHint(getBrowserPermissionHint());
                    posthog.capture("master_notifications_toggled", { enabled: false });
                }
            },
            [onChange]
        );

        return (
            <div
                className="kk-card kk-card-emphasis overflow-hidden mb-6"
                style={{
                    borderColor: enabled ? "var(--kk-ember)" : "var(--kk-smoke)",
                }}
            >
                <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <motion.div
                                className="flex-shrink-0"
                                animate={{
                                    color: enabled ? "var(--kk-ember)" : "var(--kk-ash)",
                                }}
                                transition={{ duration: 0.2 }}
                            >
                                <Bell className="h-5 w-5" />
                            </motion.div>
                            <div>
                                <span
                                    className="text-[15px] font-semibold block"
                                    style={{ color: "var(--kk-ink)" }}
                                >
                                    Notifications
                                </span>
                                <span
                                    className="text-[12px]"
                                    style={{ color: "var(--kk-ash)" }}
                                >
                                    {enabled ? "All notifications enabled" : "Notifications are off"}
                                </span>
                            </div>
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
                                        className="relative z-10 flex items-center justify-center rounded-full px-3 py-1 text-[12px] font-semibold tracking-wide"
                                        style={{
                                            color: isActive ? "white" : "var(--kk-ash)",
                                            minWidth: "32px",
                                        }}
                                    >
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <AnimatePresence>
                    {hint && !enabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t"
                            style={{ borderColor: "var(--kk-smoke)" }}
                        >
                            <div
                                className="flex items-start gap-2 p-4 text-[12px]"
                                style={{
                                    background: "var(--kk-cream)",
                                    color: "var(--kk-ash)",
                                }}
                            >
                                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                                <span>{hint}</span>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }
);

MasterToggle.displayName = "MasterToggle";

/* ── Main Component ── */

interface NotificationsSettingsProps {
    isOpen: boolean;
    onClose: () => void;
}

export const NotificationsSettings = React.memo(
    ({ isOpen, onClose }: NotificationsSettingsProps) => {
        const [masterEnabled, setMasterEnabled] = useState(() => getMasterEnabled());

        // Sync with external state
        useEffect(() => {
            const interval = setInterval(() => {
                setMasterEnabled(getMasterEnabled());
            }, 500);
            return () => clearInterval(interval);
        }, []);

        const notificationCategories: CategorySectionProps[] = [
            {
                title: "Recurring",
                items: [
                    {
                        id: "bill-reminders",
                        icon: <CalendarClock className="h-4 w-4" />,
                        label: "Bill Reminders",
                        description: "Get notified before your recurring bills are due",
                        toggle: <RecurringAlertsToggle />,
                    },
                ],
            },
            {
                title: "Daily Nudges",
                items: [
                    {
                        id: "evening-reminder",
                        icon: <Moon className="h-4 w-4" />,
                        label: "Evening Reminder",
                        description: "Gentle nudge to log expenses if no entries by 8 PM",
                        toggle: <DailyReminderToggle />,
                        time: "8:00 PM",
                    },
                ],
            },
            {
                title: "Insights",
                items: [
                    {
                        id: "kharcha-khabar",
                        icon: <AudioLines className="h-4 w-4" />,
                        label: "Mann Ki Baat",
                        description: "Daily spending insights delivered every morning",
                        toggle: <MannKiBaatToggle />,
                        time: "9:00 AM",
                    },
                ],
            },
        ];

        return (
            <AnimatePresence mode="wait">
                {isOpen && (
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 30, stiffness: 300 }}
                        className="fixed inset-0 z-50 bg-[var(--kk-paper)] overflow-auto overscroll-contain"
                    >
                        <div className="mx-auto h-full w-full max-w-4xl flex flex-col">
                            {/* Header */}
                            <header className="z-20 shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/90 px-5 py-4 backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="kk-icon-btn kk-icon-btn-lg"
                                        aria-label="Go back"
                                    >
                                        <ArrowLeft className="h-5 w-5" />
                                    </button>
                                    <h1
                                        className="text-2xl font-semibold font-[family:var(--font-display)]"
                                        style={{ color: "var(--kk-ink)" }}
                                    >
                                        Notifications
                                    </h1>
                                </div>
                            </header>

                            {/* Content */}
                            <div className="flex-1 px-4 sm:px-6 py-6">
                                <div className="mx-auto w-full max-w-lg">
                                    {/* Master Toggle */}
                                    <MasterToggle
                                        enabled={masterEnabled}
                                        onChange={setMasterEnabled}
                                    />

                                    {/* Individual Notification Settings */}
                                    <AnimatePresence>
                                        {masterEnabled && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -10 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                {notificationCategories.map((category) => (
                                                    <CategorySection
                                                        key={category.title}
                                                        title={category.title}
                                                        items={category.items}
                                                    />
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {!masterEnabled && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="kk-empty-state"
                                        >
                                            <Bell
                                                className="h-12 w-12 mx-auto mb-3"
                                                style={{ color: "var(--kk-smoke-heavy)" }}
                                            />
                                            <p
                                                className="text-[14px] font-medium"
                                                style={{ color: "var(--kk-ash)" }}
                                            >
                                                Enable notifications to see settings
                                            </p>
                                        </motion.div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }
);

NotificationsSettings.displayName = "NotificationsSettings";
