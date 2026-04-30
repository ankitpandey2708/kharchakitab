"use client";

import { useCallback, useEffect, useRef } from "react";
import type { driver as DriverFn, DriveStep } from "driver.js";

type TooltipId =
    | "recurring-presets"
    | "household-icon"
    | "notifications-toggle";

const TOOLTIP_CONFIG: Record<TooltipId, DriveStep> = {
    "recurring-presets": {
        element: "[data-tour='recurring-presets']",
        popover: {
            title: "Quick Add",
            description:
                "Tap any preset — Netflix, Jio, rent, maid — to set it up in seconds. No forms needed.",
            side: "top",
            align: "center",
        },
    },
    "household-icon": {
        element: "[data-tour='household-icon']",
        popover: {
            title: "Household Sync",
            description:
                "Connect with family members to sync expenses in real-time across devices.",
            side: "bottom",
            align: "start",
        },
    },
    "notifications-toggle": {
        element: "[data-tour='notifications-toggle']",
        popover: {
            title: "Enable Notifications",
            description:
                "Get reminders before bills are due and a daily nudge to log expenses. Tap here to turn them on.",
            side: "bottom",
            align: "end",
        },
    },
};

import { LS } from "@/src/config/storageKeys";

const STORAGE_KEY = LS.SEEN_TIPS;

// In-memory cache to avoid repeated localStorage reads + JSON.parse
let seenTipsCache: TooltipId[] | null = null;

function getSeenTips(): TooltipId[] {
    if (typeof window === "undefined") return [];
    if (seenTipsCache) return seenTipsCache;
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        seenTipsCache = stored ? (JSON.parse(stored) as TooltipId[]) : [];
        return seenTipsCache;
    } catch {
        return [];
    }
}

function markTipSeen(id: TooltipId): void {
    if (typeof window === "undefined") return;
    try {
        const seen = getSeenTips();
        if (!seen.includes(id)) {
            seen.push(id);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(seen));
            seenTipsCache = [...seen];
        }
    } catch {
        // Ignore storage errors
    }
}

function hasSeenTip(id: TooltipId): boolean {
    return getSeenTips().includes(id);
}

export function useOnboardingTour() {
    const driverRef = useRef<ReturnType<typeof DriverFn> | null>(null);
    const currentTooltipRef = useRef<TooltipId | null>(null);
    const pendingTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
    const queueRef = useRef<TooltipId[]>([]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            pendingTimersRef.current.forEach(clearTimeout);
            pendingTimersRef.current.clear();
            driverRef.current?.destroy();
        };
    }, []);

    const showNext = useCallback(async () => {
        // Already showing or pending — wait for onDestroyed to call showNext
        if (currentTooltipRef.current !== null) return;

        while (queueRef.current.length > 0) {
            const id = queueRef.current.shift()!;

            if (hasSeenTip(id)) continue;

            const config = TOOLTIP_CONFIG[id];
            const el = document.querySelector(config.element as string);
            if (!el) continue;

            currentTooltipRef.current = id;

            const [{ driver }] = await Promise.all([
                import("driver.js"),
                import("driver.js/dist/driver.css"),
            ]);
            driverRef.current = driver({
                showProgress: false,
                allowClose: true,
                overlayClickBehavior: "close",
                stagePadding: 4,
                stageRadius: 8,
                popoverClass: "kk-driver-theme",
                steps: [config],
                showButtons: ["close"],
                onDestroyed: () => {
                    markTipSeen(id);
                    currentTooltipRef.current = null;
                    driverRef.current = null;
                    // Process next queued tooltip
                    showNext();
                },
            });

            driverRef.current.drive();
            return;
        }
    }, []);

    const showTooltip = useCallback(
        (id: TooltipId, delay = 500) => {
            if (hasSeenTip(id)) return;

            const config = TOOLTIP_CONFIG[id];
            const element = document.querySelector(config.element as string);
            if (!element) return;

            // Don't enqueue duplicates
            if (queueRef.current.includes(id)) return;
            if (currentTooltipRef.current === id) return;

            const timer = setTimeout(() => {
                pendingTimersRef.current.delete(timer);

                // Re-check after delay
                if (hasSeenTip(id)) return;
                const el = document.querySelector(config.element as string);
                if (!el) return;
                if (queueRef.current.includes(id)) return;

                queueRef.current.push(id);
                showNext();
            }, delay);
            pendingTimersRef.current.add(timer);
        },
        [showNext]
    );

    /**
     * Enqueue multiple tooltips in a defined order after a single initial delay.
     * The queue processes them sequentially — each shows after the user dismisses the previous.
     * Use this for "always show on first visit" tooltips to avoid coordinating arbitrary delays.
     */
    const showTooltipsInOrder = useCallback(
        (ids: TooltipId[], initialDelay = 3000) => {
            const timer = setTimeout(() => {
                pendingTimersRef.current.delete(timer);
                for (const id of ids) {
                    if (hasSeenTip(id)) continue;
                    const el = document.querySelector(TOOLTIP_CONFIG[id].element as string);
                    if (!el) continue;
                    if (queueRef.current.includes(id)) continue;
                    if (currentTooltipRef.current === id) continue;
                    queueRef.current.push(id);
                }
                showNext();
            }, initialDelay);
            pendingTimersRef.current.add(timer);
        },
        [showNext]
    );

    const hasSeen = useCallback((id: TooltipId) => hasSeenTip(id), []);

    const resetAllTips = useCallback(() => {
        if (typeof window === "undefined") return;
        pendingTimersRef.current.forEach(clearTimeout);
        pendingTimersRef.current.clear();
        driverRef.current?.destroy();
        localStorage.removeItem(STORAGE_KEY);
        seenTipsCache = null;
        currentTooltipRef.current = null;
        queueRef.current = [];
    }, []);

    return {
        showTooltip,
        showTooltipsInOrder,
        hasSeen,
        resetAllTips,
    };
}
