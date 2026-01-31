import { useCallback, useEffect } from "react";
const SUMMARY_VIEW_KEY = "kk_summary_view";
const SUMMARY_VIEW_EVENT = "kk-summary-view-change";

interface SummaryViewSyncOptions<T extends string> {
  enabled?: boolean;
  listen?: boolean;
  parse: (value: string | null) => T | null;
  onReceive?: (value: T) => void;
}

export const useSummaryViewSync = <T extends string>({
  enabled = true,
  listen = true,
  parse,
  onReceive,
}: SummaryViewSyncOptions<T>) => {
  const syncSummaryView = useCallback((value: T) => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SUMMARY_VIEW_KEY);
    if (stored === value) return;
    window.localStorage.setItem(SUMMARY_VIEW_KEY, value);
    window.dispatchEvent(new CustomEvent(SUMMARY_VIEW_EVENT, { detail: value }));
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const stored = window.localStorage.getItem(SUMMARY_VIEW_KEY);
    const parsed = parse(stored);
    if (parsed !== null) {
      onReceive?.(parsed);
    }
  }, [enabled, onReceive, parse]);

  useEffect(() => {
    if (!enabled || !listen || typeof window === "undefined") return;
    const handleSummaryChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail ?? null;
      const parsed = parse(detail);
      if (parsed !== null) {
        onReceive?.(parsed);
      }
    };
    window.addEventListener(
      SUMMARY_VIEW_EVENT,
      handleSummaryChange as EventListener
    );
    return () => {
      window.removeEventListener(
        SUMMARY_VIEW_EVENT,
        handleSummaryChange as EventListener
      );
    };
  }, [enabled, listen, onReceive, parse]);

  return { syncSummaryView };
};
