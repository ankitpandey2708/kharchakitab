"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDeviceIdentity, fetchTransactions } from "@/src/db/db";
import { getMannKiBaatEnabled } from "@/src/services/notifications/mannKiBaat";
import {
  getMannKiBaatData,
  selectMessageType,
  getFallbackMessage,
  fetchMannKiBaatMessage,
  type MannKiBaatMessage,
} from "@/src/utils/mannKiBaat";
import posthog from "posthog-js";

const CACHE_KEY = "kk_mannKiBaat";
const todayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const useMannKiBaat = () => {
  const [message, setMessage] = useState<MannKiBaatMessage | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const generatingRef = useRef(false);

  const tryLoad = useCallback(() => {
    if (!getMannKiBaatEnabled()) return;

    const today = todayDate();
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached) as MannKiBaatMessage & { date?: string };
        if (data.date === today) {
          if (data.dismissed) { setIsDismissed(true); return; }
          setMessage(data);
          posthog.capture("mann_ki_baat_shown", { type: data.type, source: "cache" });
          return;
        }
        // Stale (different day) — remove and regenerate
        localStorage.removeItem(CACHE_KEY);
      } catch {
        localStorage.removeItem(CACHE_KEY);
      }
    }

    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load
  useEffect(() => {
    tryLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check on visibility change — handles day rollover while app is backgrounded
  useEffect(() => {
    const handleVisible = () => {
      if (document.visibilityState !== "visible") return;
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const data = JSON.parse(cached);
          if (data.date === todayDate()) return; // Still today, nothing to do
        } catch { /* regenerate */ }
      }
      // Day has rolled over — reset and regenerate
      setMessage(null);
      setIsDismissed(false);
      tryLoad();
    };

    document.addEventListener("visibilitychange", handleVisible);
    return () => document.removeEventListener("visibilitychange", handleVisible);
  }, [tryLoad]);

  const cacheSet = (msg: MannKiBaatMessage) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...msg, date: todayDate() }));
  };

  const generate = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    setIsLoading(true);
    try {
      // a. Check if user has any transactions at all
      const allTx = await fetchTransactions();
      if (allTx.length === 0) return; // no transactions yet, skip

      // b. First transaction ever - show welcome message
      if (allTx.length === 1) {
        const msg: MannKiBaatMessage = {
          message: "Pehla transaction! Ab roz yahan aaoge. 👋",
          type: "praise",
          emoji: "🎉",
          stats: {
            totalSpend: 0,
            txCount: 0,
            categories: {},
            topCategory: "Other",
            paymentMethodBreakdown: { cash: 0, upi: 0, card: 0 },
            dayOfWeek: "",
            isWeekend: false,
            items: [],
            topItem: null,
            frequentItems: [],
            hasMultipleSameItem: false,
          },
          generatedAt: Date.now(),
        };
        cacheSet(msg);
        setMessage(msg);
        posthog.capture("mann_ki_baat_shown", { type: "welcome", source: "first_txn" });
        return;
      }

      // c. Get device identity for household filtering
      const identity = await getDeviceIdentity();
      const ownerId = identity?.device_id;

      // d. Run aggregation pipeline
      const { yesterdayStats, recentContext } = await getMannKiBaatData(ownerId);

      if (yesterdayStats.txCount === 0) {
        // No history at all — simple nudge
        if (recentContext.month.totalSpend === 0) {
          const msg: MannKiBaatMessage = {
            message: "Kal kuch nahi kharch kiya ya bhool gaya add karna?",
            type: "praise",
            emoji: "😇",
            stats: yesterdayStats,
            generatedAt: Date.now(),
          };
          cacheSet(msg);
          setMessage(msg);
          posthog.capture("mann_ki_baat_shown", { type: "praise", source: "zero_spend" });
          return;
        }
        // Has history — let Gemini craft a personalized zero-spend message
        // Falls through to Gemini call below with txCount=0 stats
      }

      // e. Determine message type (deterministic)
      const messageType = selectMessageType(yesterdayStats, recentContext);
      console.log("[MannKiBaat] messageType:", messageType);
      console.log("[MannKiBaat] yesterdayStats:", JSON.stringify(yesterdayStats, null, 2));
      console.log("[MannKiBaat] recentContext:", JSON.stringify(recentContext, null, 2));

      // f. Call Gemini
      let result: { message: string; type: string; emoji: string };
      try {
        result = await fetchMannKiBaatMessage(yesterdayStats, recentContext, messageType);
        console.log("[MannKiBaat] gemini result:", JSON.stringify(result));
      } catch (err) {
        console.log("[MannKiBaat] gemini failed, using fallback:", err);
        const fallback = getFallbackMessage(yesterdayStats, messageType);
        cacheSet(fallback);
        setMessage(fallback);
        posthog.capture("mann_ki_baat_shown", { type: messageType, source: "fallback" });
        return;
      }

      // g. Cache + set
      const msg: MannKiBaatMessage = {
        message: result.message,
        type: result.type as MannKiBaatMessage["type"],
        emoji: result.emoji,
        stats: yesterdayStats,
        generatedAt: Date.now(),
      };
      cacheSet(msg);
      setMessage(msg);
      posthog.capture("mann_ki_baat_shown", { type: msg.type, source: "gemini" });
    } finally {
      setIsLoading(false);
      generatingRef.current = false;
    }
  };

  const dismiss = useCallback(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try {
        const data = JSON.parse(cached);
        data.dismissed = true;
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      } catch {
        // ignore
      }
    }
    setIsDismissed(true);
    posthog.capture("mann_ki_baat_dismissed");
  }, []);

  return { message, isDismissed, isLoading, dismiss };
};
