import { useCallback, useEffect, useRef, useState } from "react";

const STREAK_COUNT_KEY = "kk_streak_count";
const STREAK_DATE_KEY = "kk_streak_last_date";

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function readStreak(): { count: number; lastDate: string | null } {
  if (typeof window === "undefined") return { count: 0, lastDate: null };
  const count = parseInt(localStorage.getItem(STREAK_COUNT_KEY) ?? "0", 10);
  const lastDate = localStorage.getItem(STREAK_DATE_KEY);
  return { count: isNaN(count) ? 0 : count, lastDate };
}

function resolveStreak(stored: { count: number; lastDate: string | null }) {
  const today = getToday();
  const yesterday = getYesterday();

  if (!stored.lastDate) return { count: 0, broke: false, lostCount: 0 };
  if (stored.lastDate === today)
    return { count: stored.count, broke: false, lostCount: 0 };
  if (stored.lastDate === yesterday)
    return { count: stored.count, broke: false, lostCount: 0 };

  // Streak broken
  return { count: 0, broke: stored.count > 0, lostCount: stored.count };
}

// Compute initial state synchronously so first render is correct
function getInitialState() {
  const stored = readStreak();
  return resolveStreak(stored);
}

export function useStreak() {
  const [state, setState] = useState(getInitialState);
  const brokeTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Schedule animation end — clear localStorage only when animation finishes
  useEffect(() => {
    if (!state.broke) return;

    brokeTimerRef.current = setTimeout(() => {
      localStorage.setItem(STREAK_COUNT_KEY, "0");
      localStorage.removeItem(STREAK_DATE_KEY);
      setState((s) => ({ ...s, broke: false, lostCount: 0 }));
    }, 3500);

    return () => {
      if (brokeTimerRef.current) clearTimeout(brokeTimerRef.current);
    };
  }, [state.broke]);

  const recordActivity = useCallback(() => {
    const today = getToday();
    const stored = readStreak();

    if (stored.lastDate === today) return;

    const yesterday = getYesterday();
    let newCount: number;

    if (stored.lastDate === yesterday) {
      newCount = stored.count + 1;
    } else if (!stored.lastDate) {
      newCount = 1;
    } else {
      newCount = 1;
    }

    localStorage.setItem(STREAK_COUNT_KEY, String(newCount));
    localStorage.setItem(STREAK_DATE_KEY, today);
    setState({ count: newCount, broke: false, lostCount: 0 });
  }, []);

  return {
    count: state.count,
    broke: state.broke,
    lostCount: state.lostCount,
    recordActivity,
  };
}
