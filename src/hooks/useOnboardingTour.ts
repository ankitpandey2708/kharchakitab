"use client";

import { useCallback, useEffect, useRef } from "react";
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

export type TooltipId =
    | "recurring-presets"
    | "household-icon";

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
};

const STORAGE_KEY = "kk_seen_tips";

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
    const driverRef = useRef<ReturnType<typeof driver> | null>(null);
    const currentTooltipRef = useRef<TooltipId | null>(null);
    const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const queueRef = useRef<TooltipId[]>([]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (pendingTimerRef.current) {
                clearTimeout(pendingTimerRef.current);
                pendingTimerRef.current = null;
            }
            driverRef.current?.destroy();
        };
    }, []);

    const showNext = useCallback(() => {
        // Already showing or pending — wait for onDestroyed to call showNext
        if (currentTooltipRef.current !== null) return;

        while (queueRef.current.length > 0) {
            const id = queueRef.current.shift()!;

            if (hasSeenTip(id)) continue;

            const config = TOOLTIP_CONFIG[id];
            const el = document.querySelector(config.element as string);
            if (!el) continue;

            currentTooltipRef.current = id;

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

            // Single delay: callers pass the delay, no outer setTimeout needed
            pendingTimerRef.current = setTimeout(() => {
                pendingTimerRef.current = null;

                // Re-check after delay
                if (hasSeenTip(id)) return;
                const el = document.querySelector(config.element as string);
                if (!el) return;
                if (queueRef.current.includes(id)) return;

                queueRef.current.push(id);
                showNext();
            }, delay);
        },
        [showNext]
    );

    const hasSeen = useCallback((id: TooltipId) => hasSeenTip(id), []);

    const resetAllTips = useCallback(() => {
        if (typeof window === "undefined") return;
        if (pendingTimerRef.current) {
            clearTimeout(pendingTimerRef.current);
            pendingTimerRef.current = null;
        }
        driverRef.current?.destroy();
        localStorage.removeItem(STORAGE_KEY);
        seenTipsCache = null;
        currentTooltipRef.current = null;
        queueRef.current = [];
    }, []);

    return {
        showTooltip,
        hasSeen,
        resetAllTips,
    };
}
