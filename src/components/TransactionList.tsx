"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Wallet } from "lucide-react";
import {
  deleteTransaction,
  getRecentTransactions,
  getTransactionsInRange,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { getTodayRange, isToday } from "@/src/utils/dates";
import { EmptyState } from "@/src/components/EmptyState";
import { TransactionRow } from "@/src/components/TransactionRow";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";

interface TransactionListProps {
  refreshKey?: number;
  onViewAll?: () => void;
  onEdit?: (tx: Transaction) => void;
  onDeleted?: (tx: Transaction) => void;
  addedTx?: Transaction | null;
  deletedTx?: Transaction | null;
  editedTx?: Transaction | null;
  onMobileSheetChange?: (isOpen: boolean) => void;
}

const sortTransactions = (items: Transaction[]) =>
  items
    .slice()
    .sort((a, b) =>
      a.timestamp === b.timestamp
        ? b.id.localeCompare(a.id)
        : b.timestamp - a.timestamp
    );

const getRangeForView = (view: "today" | "month") => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (view === "today") {
    const today = getTodayRange(now);
    start.setTime(today.start);
    end.setTime(today.end);
  } else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(end.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  }
  return { start: start.getTime(), end: end.getTime() };
};

const isInRange = (timestamp: number, range: { start: number; end: number }) =>
  timestamp >= range.start && timestamp <= range.end;

const isProcessingRow = (tx: Transaction) =>
  tx.item === "Processing…" || tx.item.startsWith("Processing ");

const formatCurrency = (
  value: number,
  options: Intl.NumberFormatOptions = {}
) =>
  value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    ...options,
  });

export const TransactionList = ({
  refreshKey,
  onViewAll,
  onEdit,
  onDeleted,
  addedTx,
  deletedTx,
  editedTx,
  onMobileSheetChange,
}: TransactionListProps) => {
  const SUMMARY_VIEW_KEY = "kk_summary_view";
  const SUMMARY_VIEW_EVENT = "kk-summary-view-change";
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [todayTransactions, setTodayTransactions] = useState<Transaction[]>([]);
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [budgets, setBudgets] = useState<{
    monthly: number | null;
    coachmarkDismissedMonth?: string | null;
  }>({
    monthly: null,
    coachmarkDismissedMonth: null,
  });
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [summaryView, setSummaryView] = useState<"today" | "month">("month");
  const [coachmarkDismissed, setCoachmarkDismissed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileSheetTxId, setMobileSheetTxId] = useState<string | null>(null);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const [mobileConfirmDelete, setMobileConfirmDelete] = useState(false);
  const transactionsRef = React.useRef<Transaction[]>([]);
  const todayTransactionsRef = React.useRef<Transaction[]>([]);
  const periodTransactionsRef = React.useRef<Transaction[]>([]);
  const hasEdit = Boolean(onEdit);
  const currentMonthKey = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  })();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobileQuery = window.matchMedia("(max-width: 639px)");
    const coarseQuery = window.matchMedia("(pointer: coarse)");
    const updateIsMobile = () => {
      setIsMobile(mobileQuery.matches || coarseQuery.matches);
    };
    updateIsMobile();
    const add = (query: MediaQueryList) => {
      if (query.addEventListener) {
        query.addEventListener("change", updateIsMobile);
        return () => query.removeEventListener("change", updateIsMobile);
      }
      query.addListener(updateIsMobile);
      return () => query.removeListener(updateIsMobile);
    };
    const cleanupMobile = add(mobileQuery);
    const cleanupCoarse = add(coarseQuery);
    return () => {
      cleanupMobile();
      cleanupCoarse();
    };
  }, []);

  useEffect(() => {
    if (!isMobileSheetOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isMobileSheetOpen]);

  useEffect(() => {
    if (!isMobileSheetOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileSheetOpen(false);
        setMobileConfirmDelete(false);
        setMobileSheetTxId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileSheetOpen]);

  useEffect(() => {
    onMobileSheetChange?.(isMobileSheetOpen);
  }, [isMobileSheetOpen, onMobileSheetChange]);

  useEffect(() => {
    return () => {
      onMobileSheetChange?.(false);
    };
  }, [onMobileSheetChange]);

  const syncSummaryView = useCallback(
    (next: "today" | "month") => {
      const stored = window.localStorage.getItem(SUMMARY_VIEW_KEY);
      if (stored === next) return;
      window.localStorage.setItem(SUMMARY_VIEW_KEY, next);
      window.dispatchEvent(
        new CustomEvent(SUMMARY_VIEW_EVENT, { detail: next })
      );
    },
    []
  );

  const isInCurrentMonth = useCallback((timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }, []);

  const reloadTransactions = useCallback((isActive?: () => boolean) => {
    const shouldUpdate = () => (isActive ? isActive() : true);
    setIsLoading(true);
    const recentPromise = getRecentTransactions(5)
      .then((items) => {
        if (shouldUpdate()) setTransactions(sortTransactions(items));
      })
      .catch(() => {
        if (shouldUpdate()) setTransactions([]);
      });

    const range = getRangeForView(summaryView);
    const rangePromise = getTransactionsInRange(range.start, range.end)
      .then((items) => {
        if (!shouldUpdate()) return;
        const sorted = sortTransactions(items);
        setPeriodTransactions(sorted);
        if (summaryView === "today") {
          setTodayTransactions(sorted);
        } else {
          setTodayTransactions(sorted.filter((tx) => isToday(tx.timestamp)));
        }
      })
      .catch(() => {
        if (shouldUpdate()) {
          setPeriodTransactions([]);
          setTodayTransactions([]);
        }
      });

    const monthPromise =
      summaryView === "today"
        ? (() => {
          const monthRange = getRangeForView("month");
          return getTransactionsInRange(monthRange.start, monthRange.end);
        })()
          .then((items) => {
            if (!shouldUpdate()) return;
            const total = items
              .filter((tx) => !isProcessingRow(tx))
              .reduce((sum, tx) => sum + tx.amount, 0);
            setMonthTotal((prev) => (prev === total ? prev : total));
          })
          .catch(() => {
            if (shouldUpdate()) setMonthTotal((prev) => (prev === null ? prev : null));
          })
        : null;

    const promises = [recentPromise, rangePromise];
    if (monthPromise) promises.push(monthPromise);
    Promise.allSettled(promises).then(() => {
      if (shouldUpdate()) setIsLoading(false);
    });
  }, [summaryView]);

  useEffect(() => {
    let active = true;
    reloadTransactions(() => active);
    return () => {
      active = false;
    };
  }, [refreshKey, summaryView]);

  useEffect(() => {
    const stored = window.localStorage.getItem(SUMMARY_VIEW_KEY);
    if (!stored) return;
    if (stored === "today" || stored === "month") {
      setSummaryView(stored);
    } else if (stored === "week") {
      setSummaryView("month");
    }
  }, []);

  useEffect(() => {
    const handleSummaryChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === "today" || detail === "month") {
        setSummaryView(detail);
      } else if (detail === "week") {
        setSummaryView("month");
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
  }, []);

  useEffect(() => {
    const stored = window.localStorage.getItem("kk_budgets");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<typeof budgets> & {
        monthly?: number;
        coachmarkDismissedMonth?: string;
      };
      const nextBudgets = {
        monthly:
          typeof parsed.monthly === "number" && parsed.monthly > 0
            ? parsed.monthly
            : null,
        coachmarkDismissedMonth:
          typeof parsed.coachmarkDismissedMonth === "string"
            ? parsed.coachmarkDismissedMonth
            : null,
      };
      setBudgets(nextBudgets);
      setCoachmarkDismissed(nextBudgets.coachmarkDismissedMonth === currentMonthKey);
    } catch {
      setBudgets({ monthly: null, coachmarkDismissedMonth: null });
      setCoachmarkDismissed(false);
    }
  }, [currentMonthKey]);

  useEffect(() => {
    if (!deletedTx) return;
    setTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
    setTodayTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
    setPeriodTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
    if (summaryView !== "month" && isInCurrentMonth(deletedTx.timestamp)) {
      setMonthTotal((prev) => (prev === null ? prev : prev - deletedTx.amount));
    }
  }, [deletedTx, summaryView, isInCurrentMonth]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    todayTransactionsRef.current = todayTransactions;
  }, [todayTransactions]);

  useEffect(() => {
    periodTransactionsRef.current = periodTransactions;
  }, [periodTransactions]);

  useEffect(() => {
    if (!editedTx) return;
    const previous =
      transactionsRef.current.find((tx) => tx.id === editedTx.id) ??
      todayTransactionsRef.current.find((tx) => tx.id === editedTx.id) ??
      periodTransactionsRef.current.find((tx) => tx.id === editedTx.id) ??
      null;
    setTransactions((prev) =>
      sortTransactions(prev.map((tx) => (tx.id === editedTx.id ? editedTx : tx)))
    );
    setTodayTransactions((prev) => {
      const exists = prev.find((tx) => tx.id === editedTx.id);
      if (isToday(editedTx.timestamp)) {
        if (exists) {
          return sortTransactions(
            prev.map((tx) => (tx.id === editedTx.id ? editedTx : tx))
          );
        }
        return sortTransactions([editedTx, ...prev]);
      }
      if (exists) {
        return sortTransactions(prev.filter((tx) => tx.id !== editedTx.id));
      }
      return sortTransactions(prev);
    });
    setPeriodTransactions((prev) => {
      const range = getRangeForView(summaryView);
      const inRange = isInRange(editedTx.timestamp, range);
      const exists = prev.find((tx) => tx.id === editedTx.id);
      if (inRange) {
        if (exists) {
          return sortTransactions(
            prev.map((tx) => (tx.id === editedTx.id ? editedTx : tx))
          );
        }
        return sortTransactions([editedTx, ...prev]);
      }
      if (exists) {
        return sortTransactions(prev.filter((tx) => tx.id !== editedTx.id));
      }
      return sortTransactions(prev);
    });
    if (summaryView !== "month") {
      const wasInMonth = previous ? isInCurrentMonth(previous.timestamp) : false;
      const nowInMonth = isInCurrentMonth(editedTx.timestamp);
      let delta = 0;
      if (previous) {
        if (wasInMonth && nowInMonth) {
          delta = editedTx.amount - previous.amount;
        } else if (wasInMonth && !nowInMonth) {
          delta = -previous.amount;
        } else if (!wasInMonth && nowInMonth) {
          delta = editedTx.amount;
        }
      } else if (nowInMonth) {
        delta = editedTx.amount;
      }
    if (delta !== 0) {
      setMonthTotal((prev) => (prev === null ? prev : prev + delta));
    }
  }
  }, [editedTx, summaryView, isInCurrentMonth]);

  useEffect(() => {
    if (!addedTx) return;
    if (summaryView === "month") return;
    if (!isInCurrentMonth(addedTx.timestamp)) return;
    setMonthTotal((prev) => (prev === null ? prev : prev + addedTx.amount));
  }, [addedTx, summaryView, isInCurrentMonth]);

  const { summaryTransactionsFiltered, viewTotal, totalCount, avgToday } =
    useMemo(() => {
      const summaryTransactions =
        summaryView === "today" ? todayTransactions : periodTransactions;
      const filtered = summaryTransactions.filter(
        (tx) => !isProcessingRow(tx)
      );
      const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);
      const count = filtered.length;
      return {
        summaryTransactionsFiltered: filtered,
        viewTotal: total,
        totalCount: count,
        avgToday: count > 0 ? total / count : null,
      };
    }, [summaryView, todayTransactions, periodTransactions]);

  const recentTransactions = transactions;
  const monthToDateTotal = summaryView === "month" ? viewTotal : monthTotal;
  const activeBudget = budgets.monthly;
  const hasBudget = typeof activeBudget === "number" && activeBudget > 0;
  const { remaining, overspend, budgetPercent } = useMemo(() => {
    if (!hasBudget) {
      return { remaining: null, overspend: false, budgetPercent: 0 };
    }
    const total = monthToDateTotal ?? viewTotal;
    return {
      remaining: Math.max(activeBudget - total, 0),
      overspend: total > activeBudget,
      budgetPercent: Math.min(total / activeBudget, 1),
    };
  }, [activeBudget, hasBudget, monthToDateTotal, viewTotal]);

  const budgetLabel = "Monthly Budget";
  const resetHintLabel = (() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    return `Resets on ${nextMonth.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    })}`;
  })();
  const COACHMARK_MIN_TRANSACTIONS = 1;

  const handleBudgetSave = () => {
    if (budgetDraft.trim() === "") {
      setBudgetError("Enter a positive number");
      return;
    }
    const parsed = Number(budgetDraft);
    if (!Number.isFinite(parsed)) {
      setBudgetError("Enter a positive number");
      return;
    }
    setBudgetError(null);
    setBudgets((prev) => {
      const next = { ...prev, monthly: parsed === 0 ? null : parsed };
      window.localStorage.setItem("kk_budgets", JSON.stringify(next));
      return next;
    });
    setIsEditingBudget(false);
  };
  const openBudgetEditor = () => {
    setBudgetError(null);
    setBudgetDraft(activeBudget ? String(activeBudget) : "");
    setIsEditingBudget(true);
  };
  const openBudgetEditorFromPacing = () => {
    setSummaryView("month");
    syncSummaryView("month");
    openBudgetEditor();
  };
  const dismissCoachmark = () => {
    setCoachmarkDismissed(true);
    setBudgets((prev) => {
      const next = { ...prev, coachmarkDismissedMonth: currentMonthKey };
      window.localStorage.setItem("kk_budgets", JSON.stringify(next));
      return next;
    });
  };

  const isPacingView = summaryView !== "month";
  const pacingLabel = "Daily cap";
  const daysLeftInMonth = (() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    const MS_DAY = 24 * 60 * 60 * 1000;
    return Math.floor((monthEnd.getTime() - today.getTime()) / MS_DAY) + 1;
  })();
  const dailyCap =
    hasBudget && remaining !== null && daysLeftInMonth > 0
      ? remaining / daysLeftInMonth
      : 0;
  const pacingCap = summaryView === "today" ? dailyCap : 0;
  const pacingSpent = viewTotal;
  const pacingRemaining = Math.max(pacingCap - pacingSpent, 0);
  const pacingOverspend = hasBudget && isPacingView && pacingSpent > pacingCap;
  const pacingPercent =
    hasBudget && isPacingView && pacingCap > 0
      ? Math.min(pacingSpent / pacingCap, 1)
      : 0;
  const pacingTooltip = `Spent ₹${formatCurrency(pacingSpent)} / Cap ₹${formatCurrency(
    pacingCap
  )} • ${pacingOverspend
    ? `Remaining -₹${formatCurrency(pacingSpent - pacingCap)}`
    : `Remaining ₹${formatCurrency(pacingRemaining)}`}`;

  const compactBudgetRow = ({
    title,
    subtitle,
    actionLabel,
    onAction,
    tone = "neutral",
    onDismiss,
  }: {
    title: string;
    subtitle?: string;
    actionLabel: string;
    onAction: () => void;
    tone?: "neutral" | "coachmark";
    onDismiss?: () => void;
  }) => (
    <div
      className={`rounded-[var(--kk-radius-md)] border px-4 py-3 ${tone === "coachmark"
        ? "border-[var(--kk-ember)]/30 bg-[var(--kk-ember)]/[0.06]"
        : "border-[var(--kk-smoke)] bg-white/80"
        }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-center sm:text-left sm:pr-2">
          <div className="truncate text-sm font-medium text-[var(--kk-ink)]">
            {title}
          </div>
          {subtitle && <div className="kk-meta mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="kk-btn-ghost kk-btn-compact w-full sm:w-auto"
              aria-label="Dismiss budget nudge"
              title="Dismiss"
            >
              Not now
            </button>
          )}
          <button
            type="button"
            onClick={onAction}
            className="kk-btn-secondary kk-btn-compact w-full sm:w-auto"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );

  const budgetSurface = (
    <div className="kk-surface kk-shadow-sm px-4 py-4 sm:px-5 sm:py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="kk-label">{budgetLabel}</div>
          <div className="kk-meta mt-1">{resetHintLabel}</div>
        </div>
        <div className="text-right">
          {!isEditingBudget && hasBudget && (
            <button
              type="button"
              onClick={openBudgetEditor}
              className="text-xs font-medium text-[var(--kk-ember)] transition hover:text-[var(--kk-ember-ink)]"
              aria-label="Edit budget"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="space-y-2">
          {isEditingBudget ? (
            <>
              <div className="flex items-center gap-2">
                <span className="kk-pill">₹</span>
                <input
                  type="number"
                  min="1"
                  inputMode="decimal"
                  placeholder={`Enter ${budgetLabel.toLowerCase()}`}
                  value={budgetDraft}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next.trim().startsWith("-")) return;
                    setBudgetDraft(next);
                  }}
                  className="kk-input h-9 text-sm"
                />
              </div>
              {budgetError && (
                <div className="kk-meta text-[var(--kk-ember)]">{budgetError}</div>
              )}
            </>
          ) : hasBudget ? (
            <>
              <div className="flex items-center justify-between gap-4">
                <div className="text-right">
                  <div className="kk-meta">Remaining</div>
                  <div
                    className={`text-lg font-semibold ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ink)]"
                      }`}
                  >
                    {overspend
                      ? `-₹${formatCurrency(viewTotal - (activeBudget ?? 0))}`
                      : `₹${formatCurrency(remaining ?? 0)}`}
                  </div>
                </div>
              </div>
              <div
                className={`kk-progress-rail ${overspend ? "kk-progress-rail-over" : ""}`}
              >
                <div
                  className="kk-progress-fill"
                  style={{ width: `${Math.round(budgetPercent * 100)}%` }}
                />
              </div>
            </>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2">
          {isEditingBudget
            ? (() => {
              const isSavePrimary =
                budgetDraft.trim() !== "" || Boolean(budgetError);
              return (
                <>
                  <button
                    type="button"
                    onClick={handleBudgetSave}
                    className={`${isSavePrimary ? "kk-btn-primary" : "kk-btn-secondary"
                      } kk-btn-compact`}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingBudget(false)}
                    className="kk-btn-secondary kk-btn-compact"
                  >
                    {hasBudget ? "Cancel" : "Close"}
                  </button>
                </>
              );
            })()
            : null}
        </div>
      </div>
    </div>
  );

  const coachmarkEligible =
    summaryView === "month" &&
    !hasBudget &&
    !isEditingBudget &&
    !coachmarkDismissed &&
    totalCount >= COACHMARK_MIN_TRANSACTIONS;

  const budgetBlock = (() => {
    if (summaryView !== "month") return null;

    if (hasBudget || isEditingBudget) {
      return budgetSurface;
    }

    if (!coachmarkEligible) return null;
    return compactBudgetRow({
      title: "Want a monthly budget?",
      subtitle: "See monthly progress and pace limits",
      actionLabel: "Add",
      onAction: openBudgetEditor,
      tone: "coachmark",
      onDismiss: dismissCoachmark,
    });
  })();

  const pacingBlock =
    !hasBudget || !isPacingView ? null : (
      <div className="mt-4 rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="kk-label">Daily Allowance</div>
            <button
              type="button"
              onClick={openBudgetEditorFromPacing}
              className="text-xs font-medium text-[var(--kk-ember)] transition hover:text-[var(--kk-ember-ink)]"
              aria-label="Edit monthly budget"
            >
              Edit
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-start gap-4">
          <div>
            <div className="kk-meta">Remaining</div>
            <div
              className={`text-base font-semibold ${pacingOverspend
                ? "text-[var(--kk-danger-ink)]"
                : "text-[var(--kk-ink)]"
                }`}
            >
              {pacingOverspend
                ? `-₹${formatCurrency(pacingSpent - pacingCap)}`
                : `₹${formatCurrency(pacingRemaining)}`}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="relative mt-2 w-full border-0 bg-transparent p-0 text-left"
          aria-label={pacingTooltip}
        >
          <div
            className={`kk-progress-rail ${pacingOverspend ? "kk-progress-rail-over" : ""}`}
          >
            <div
              className="kk-progress-fill"
              style={{
                width: `${Math.round(pacingPercent * 100)}%`,
              }}
            />
          </div>
        </button>
      </div>
    );

  const findTxById = useCallback(
    (id: string) =>
      transactions.find((tx) => tx.id === id) ??
      todayTransactions.find((tx) => tx.id === id) ??
      periodTransactions.find((tx) => tx.id === id) ??
      null,
    [periodTransactions, todayTransactions, transactions]
  );

  const handleDelete = useCallback(async (id: string) => {
    const removed = findTxById(id);
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    setTodayTransactions((prev) => prev.filter((tx) => tx.id !== id));
    try {
      await deleteTransaction(id);
      if (removed) {
        onDeleted?.(removed);
      }
    } catch {
      reloadTransactions();
    }
  }, [findTxById, onDeleted, reloadTransactions]);

  const handleEdit = useCallback(
    (id: string) => {
      if (!onEdit) return;
      const tx = findTxById(id);
      if (tx) onEdit(tx);
    },
    [findTxById, onEdit]
  );

  const mobileSheetTx = mobileSheetTxId ? findTxById(mobileSheetTxId) : null;

  const openMobileSheet = useCallback((id: string) => {
    setMobileSheetTxId(id);
    setMobileConfirmDelete(false);
    setIsMobileSheetOpen(true);
  }, []);

  const closeMobileSheet = useCallback(() => {
    setIsMobileSheetOpen(false);
    setMobileConfirmDelete(false);
    setMobileSheetTxId(null);
  }, []);

  if (!isLoading && transactions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="kk-card p-8 text-center"
      >
        <EmptyState
          icon={<Wallet className="h-8 w-8 text-[var(--kk-ash)]" />}
          title="Your ledger is empty"
          subtitle="Tap the mic or share a receipt screenshot to log your first expense"
          className="py-2"
        />
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Today's Summary Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="kk-card overflow-hidden p-5"
      >
        <div className="flex flex-wrap items-center justify-center gap-3">
          <select
            value={summaryView}
            onChange={(event) => {
              const next = event.target.value as "today" | "month";
              setSummaryView(next);
              syncSummaryView(next);
            }}
            className="kk-input kk-input-compact kk-select kk-shadow-sm h-8 !w-auto min-w-[110px] max-w-[160px] rounded-full px-3 text-center"
            style={{ textAlignLast: "center" }}
          >
            <option value="today">Today</option>
            <option value="month">This month</option>
          </select>
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="kk-label">Total</div>
            <div className="mt-1 flex items-baseline justify-center gap-1 sm:justify-start">
              <span className="text-lg font-medium text-[var(--kk-ember)]">₹</span>
              <span className="text-[clamp(1.9rem,8.5vw,2.7rem)] font-bold leading-none tracking-tight font-[family:var(--font-mono)] sm:text-4xl">
                {formatCurrency(viewTotal)}
              </span>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="kk-pill kk-pill-muted">
                {totalCount} {totalCount === 1 ? "transaction" : "transactions"}
              </span>
              <span className="kk-pill kk-pill-muted">
                Avg:{" "}
                <span className="font-medium text-[var(--kk-ink)]">
                  {avgToday === null
                    ? "—"
                    : `₹${formatCurrency(avgToday, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
                </span>
              </span>
            </div>
          )}
        </div>
        {pacingBlock}
        {summaryView === "month" && <div className="mt-5">{budgetBlock}</div>}
      </motion.div>

      {/* Recent Transactions Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.08 }}
        className="kk-card p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="kk-label">Last 5 txns</div>
          </div>
          <div className="flex items-center gap-3">
            {onViewAll && (
              <button
                type="button"
                onClick={onViewAll}
                className="kk-btn-secondary kk-btn-compact"
              >
                View all
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <AnimatePresence mode="popLayout">
            {recentTransactions.map((tx, index) => {
              const processing = isProcessingRow(tx);
              const rowKey = tx.id || `recent-${index}`;
              return (
                <TransactionRow
                  key={rowKey}
                  tx={tx}
                  index={index}
                  metaVariant="date"
                  isMobile={isMobile}
                  hasEdit={hasEdit}
                  onEdit={hasEdit ? handleEdit : undefined}
                  onDelete={handleDelete}
                  onOpenMobileSheet={openMobileSheet}
                  formatCurrency={formatCurrency}
                  amountMaxWidthClass="max-w-[24vw]"
                  isProcessing={processing}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      <TransactionActionSheet
        isOpen={isMobileSheetOpen}
        tx={mobileSheetTx}
        hasEdit={hasEdit}
        confirmDelete={mobileConfirmDelete}
        setConfirmDelete={setMobileConfirmDelete}
        onClose={closeMobileSheet}
        onEdit={hasEdit ? handleEdit : undefined}
        onDelete={handleDelete}
        formatCurrency={formatCurrency}
      />
    </div>
  );
};
