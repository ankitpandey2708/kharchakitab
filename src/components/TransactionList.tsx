"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Listbox, Transition } from "@headlessui/react";
import { ImageUp, Info, Wallet, ChevronDown, Check, Upload } from "lucide-react";
import {
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
  isTransactionShared,
  getDeviceIdentity,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { getRangeForFilter, isToday } from "@/src/utils/dates";
import { EmptyState } from "@/src/components/EmptyState";
import { TransactionRow } from "@/src/components/TransactionRow";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";
import { formatCurrency } from "@/src/utils/money";
import { useMobileSheet } from "@/src/hooks/useMobileSheet";
import { useSummaryViewSync } from "@/src/hooks/useSummaryViewSync";
import { ImportModal } from "@/src/components/ImportModal";

interface TransactionListProps {
  refreshKey?: number;
  onViewAll?: () => void;
  onEdit?: (tx: Transaction) => void;
  onDeleted?: (tx: Transaction) => void;
  onReceiptUploadClick?: () => void;
  isReceiptProcessing?: boolean;
  addedTx?: Transaction | null;
  deletedTx?: Transaction | null;
  editedTx?: Transaction | null;
  pendingTransactions?: Transaction[];
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

const isInRange = (timestamp: number, range: { start: number; end: number }) =>
  timestamp >= range.start && timestamp <= range.end;

const isProcessingRow = (tx: Transaction) =>
  tx.item === "Processing…" || tx.item.startsWith("Processing ");

const CompactBudgetRow = ({
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

export const TransactionList = React.memo(({
  refreshKey,
  onViewAll,
  onEdit,
  onDeleted,
  onReceiptUploadClick,
  isReceiptProcessing = false,
  addedTx,
  deletedTx,
  editedTx,
  pendingTransactions = [],
  onMobileSheetChange,
}: TransactionListProps) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [todayTransactions, setTodayTransactions] = useState<Transaction[]>([]);
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  const [monthTotal, setMonthTotal] = useState<number | null>(null);
  const [identity, setIdentity] = useState<{ device_id: string } | null>(null);
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
  const [isLoading, setIsLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const hasLoadedOnce = React.useRef(false);
  const {
    isOpen: isMobileSheetOpen,
    activeId: mobileSheetTxId,
    confirmDelete: mobileConfirmDelete,
    setConfirmDelete: setMobileConfirmDelete,
    openSheet: baseOpenMobileSheet,
    closeSheet: closeMobileSheet,
  } = useMobileSheet({ onOpenChange: onMobileSheetChange });
  const [isMobileSheetShared, setIsMobileSheetShared] = useState(false);

  const openMobileSheet = useCallback(async (id: string) => {
    const shared = await isTransactionShared(id);
    setIsMobileSheetShared(shared);
    baseOpenMobileSheet(id);
  }, [baseOpenMobileSheet]);
  const transactionsRef = React.useRef<Transaction[]>([]);
  const todayTransactionsRef = React.useRef<Transaction[]>([]);
  const periodTransactionsRef = React.useRef<Transaction[]>([]);
  const hasEdit = Boolean(onEdit);
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, []);

  const { syncSummaryView } = useSummaryViewSync({
    parse: (value) => {
      if (value === "today" || value === "month") return value;
      if (value === "week") return "month";
      return null;
    },
    onReceive: (value) => {
      setSummaryView((prev) => (prev === value ? prev : value));
    },
  });

  useEffect(() => {
    void (async () => {
      const id = await getDeviceIdentity();
      setIdentity(id);
    })();
  }, []);

  const isInCurrentMonth = useCallback((timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }, []);

  const reloadTransactions = useCallback((isActive?: () => boolean) => {
    if (!identity) return;
    const shouldUpdate = () => (isActive ? isActive() : true);
    if (!hasLoadedOnce.current) setIsLoading(true);
    // Cap "activity" views to "now" so scheduled/future entries don't pollute spent/last-txns UI.
    // BUG-4 fix: Snap to end-of-today so the cache key stays stable across calls.
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const beforeNow = eod.getTime() + 1;

    // Always fetch recent 5 transactions
    const recentPromise = fetchTransactions({ limit: 5, ownerId: identity.device_id, before: beforeNow })
      .then((items) => {
        if (shouldUpdate()) setTransactions(sortTransactions(items));
      })
      .catch(() => {
        if (shouldUpdate()) setTransactions([]);
      });

    // A: Always fetch month range; derive today in-memory when needed (saves 1 IDB call)
    const monthRange = getRangeForFilter("month");
    const rangePromise = monthRange
      ? fetchTransactions({ range: { start: monthRange.start, end: monthRange.end }, ownerId: identity.device_id, before: beforeNow })
        .then((items) => {
          if (!shouldUpdate()) return;
          const sorted = sortTransactions(items);
          startTransition(() => {
            if (summaryView === "today") {
              const todayItems = sorted.filter((tx) => isToday(tx.timestamp));
              setPeriodTransactions(todayItems);
              setTodayTransactions(todayItems);
              const total = items
                .filter((tx) => !isProcessingRow(tx))
                .reduce((sum, tx) => sum + tx.amount, 0);
              setMonthTotal((prev) => (prev === total ? prev : total));
            } else {
              setPeriodTransactions(sorted);
              setTodayTransactions(sorted.filter((tx) => isToday(tx.timestamp)));
            }
          });
        })
        .catch(() => {
          if (shouldUpdate()) {
            startTransition(() => {
              setPeriodTransactions([]);
              setTodayTransactions([]);
              if (summaryView === "today") {
                setMonthTotal((prev) => (prev === null ? prev : null));
              }
            });
          }
        })
      : Promise.resolve();

    Promise.allSettled([recentPromise, rangePromise]).then(() => {
      if (shouldUpdate()) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    });
  }, [summaryView, identity]);

  useEffect(() => {
    let active = true;
    reloadTransactions(() => active);
    return () => {
      active = false;
    };
  }, [refreshKey, summaryView, identity]);

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
      const range = getRangeForFilter(summaryView === "today" ? "today" : "month");
      const inRange = range ? isInRange(editedTx.timestamp, range) : false;
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

  const recentTransactions = useMemo(
    () => [...pendingTransactions, ...transactions].slice(0, 5),
    [pendingTransactions, transactions]
  );
  const monthToDateTotal = summaryView === "month" ? viewTotal : monthTotal;
  const activeBudget = budgets.monthly;
  const hasBudget = typeof activeBudget === "number" && activeBudget > 0;
  const { remaining, overspend, budgetPercent, rawRemaining } = useMemo(() => {
    if (!hasBudget) {
      return { remaining: null, overspend: false, budgetPercent: 0, rawRemaining: null };
    }
    const total = monthToDateTotal ?? viewTotal;
    const raw = activeBudget - total;
    return {
      remaining: Math.max(raw, 0),
      overspend: raw < 0,
      budgetPercent: Math.min(total / activeBudget, 1),
      rawRemaining: raw,
    };
  }, [activeBudget, hasBudget, monthToDateTotal, viewTotal]);

  const budgetLabel = "Monthly Budget";
  const resetHintLabel = useMemo(() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    return `Resets on ${nextMonth.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    })}`;
  }, []);
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
  const daysLeftInMonth = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    monthEnd.setHours(0, 0, 0, 0);
    const MS_DAY = 24 * 60 * 60 * 1000;
    return Math.floor((monthEnd.getTime() - today.getTime()) / MS_DAY) + 1;
  }, []);
  const pacingSpent = viewTotal;
  const pacingTarget =
    hasBudget &&
      isPacingView &&
      rawRemaining !== null &&
      daysLeftInMonth > 0
      ? (() => {
        // Solve (B - (M + x)) / D = T + x for x.
        // B = activeBudget, M = monthToDateTotal (includes today), T = pacingSpent, D = daysLeftInMonth.
        return (activeBudget - (monthToDateTotal ?? viewTotal) - daysLeftInMonth * pacingSpent) /
          (daysLeftInMonth + 1);
      })()
      : 0;
  const pacingCap =
    summaryView === "today" ? pacingSpent + Math.max(pacingTarget, 0) : 0;
  const pacingRemaining = Math.max(pacingTarget, 0);
  const pacingOverspend =
    hasBudget && isPacingView && pacingTarget < 0;
  const pacingOverspendAmount = Math.max(-pacingTarget, 0);
  const pacingPercent =
    hasBudget && isPacingView && pacingCap > 0
      ? Math.min(pacingSpent / pacingCap, 1)
      : 0;
  const pacingTooltip = `Spent ₹${formatCurrency(pacingSpent)} / Cap ₹${formatCurrency(
    pacingCap
  )} • ${pacingOverspend
    ? `Over by ₹${formatCurrency(pacingOverspendAmount)}`
    : `Remaining ₹${formatCurrency(pacingRemaining)}`}`;


  // compactBudgetRow extracted to module scope (CompactBudgetRow)

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
                      ? <span>-<span className="kk-rupee">₹</span>{formatCurrency(viewTotal - (activeBudget ?? 0))}</span>
                      : <span><span className="kk-rupee">₹</span>{formatCurrency(remaining ?? 0)}</span>}
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
    !coachmarkDismissed;

  const budgetBlock = (() => {
    if (summaryView !== "month") return null;

    if (hasBudget || isEditingBudget) {
      return budgetSurface;
    }

    if (!coachmarkEligible) return null;
    return (
      <CompactBudgetRow
        title="Want a monthly budget?"
        subtitle="See monthly progress and pace limits"
        actionLabel="Add"
        onAction={openBudgetEditor}
        tone="coachmark"
        onDismiss={dismissCoachmark}
      />
    );
  })();

  const pacingBlock =
    !hasBudget || !isPacingView ? null : (
      <div className="mt-4 rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="kk-label">Safe to spend today</div>
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
          {pacingOverspend ? (
            <div>
              <div className="kk-meta">Over by</div>
              <div className="text-base font-semibold text-[var(--kk-danger-ink)]">
                <span className="kk-rupee">₹</span>{formatCurrency(pacingOverspendAmount)}
              </div>
            </div>
          ) : (
            <div>
              <div className="kk-meta">Remaining</div>
              <div className="text-base font-semibold text-[var(--kk-ink)]">
                <span className="kk-rupee">₹</span>{formatCurrency(pacingRemaining)}
              </div>
            </div>
          )}
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

  const handleTogglePrivate = useCallback(
    async (id: string, nextPrivate: boolean) => {
      const shared = await isTransactionShared(id);
      if (shared && nextPrivate) return; // Prevent marking shared as private
      const tx = findTxById(id);
      if (!tx) return;
      await updateTransaction(id, { is_private: nextPrivate });
      reloadTransactions();
    },
    [findTxById, reloadTransactions]
  );

  const mobileSheetTx = mobileSheetTxId ? findTxById(mobileSheetTxId) : null;
  const hasReceiptEntry = Boolean(onReceiptUploadClick);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="kk-card h-36 animate-pulse bg-[var(--kk-mist)]/50 sm:h-44" />
        <div className="kk-card h-64 animate-pulse bg-[var(--kk-mist)]/50" />
      </div>
    );
  }

  if (transactions.length === 0 && pendingTransactions.length === 0) {
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
          subtitle="Tap the mic to log your first expense"
          className="py-2"
        >
          <button
            type="button"
            onClick={() => setIsImportOpen(true)}
            className="mt-4 kk-btn-secondary kk-btn-compact"
          >
            <Upload className="h-3.5 w-3.5" />
            Import from CSV
          </button>
        </EmptyState>
        {isImportOpen && (
          <ImportModal
            isOpen={isImportOpen}
            onClose={() => setIsImportOpen(false)}
            onImported={() => reloadTransactions()}
          />
        )}
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
          <Listbox
            value={summaryView}
            onChange={(next) => {
              setSummaryView(next);
              syncSummaryView(next);
            }}
          >
            <div className="relative">
              <Listbox.Button className="kk-input kk-input-compact kk-select kk-shadow-sm flex h-8 !w-auto min-w-[110px] max-w-[160px] items-center justify-between rounded-full px-3 text-center">
                <span className="flex-1 text-center">
                  {summaryView === "today" ? "Today" : "This month"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-[var(--kk-ash)]" />
              </Listbox.Button>
              <Transition
                enter="transition ease-out duration-120"
                enterFrom="opacity-0 -translate-y-1"
                enterTo="opacity-100 translate-y-0"
                leave="transition ease-in duration-90"
                leaveFrom="opacity-100 translate-y-0"
                leaveTo="opacity-0 -translate-y-1"
              >
                <Listbox.Options className="absolute z-50 mt-2 w-full min-w-[140px] overflow-hidden rounded-xl border border-[var(--kk-smoke)] bg-white p-1 text-sm shadow-[var(--kk-shadow-lg)]">
                  {[
                    { key: "today" as const, label: "Today" },
                    { key: "month" as const, label: "This month" },
                  ].map((option) => (
                    <Listbox.Option
                      key={option.key}
                      value={option.key}
                      className={({ active }) =>
                        `flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${active
                          ? "bg-[var(--kk-cream)] text-[var(--kk-ink)]"
                          : "text-[var(--kk-ash)]"
                        }`
                      }
                    >
                      {({ selected }) => (
                        <>
                          <span className={`truncate ${selected ? "font-semibold text-[var(--kk-ink)]" : ""}`}>
                            {option.label}
                          </span>
                          {selected && <Check className="h-4 w-4 text-[var(--kk-ember)]" />}
                        </>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </div>
          </Listbox>
        </div>
        <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="kk-label">Total</div>
            <div className="mt-1 flex items-baseline justify-center gap-1 sm:justify-start">
              <span className="kk-rupee text-[clamp(1rem,4vw,1.4rem)] font-bold font-[family:var(--font-mono)]">₹</span>
              <span className="text-[clamp(1.9rem,8.5vw,2.7rem)] font-bold leading-none tracking-tight font-[family:var(--font-mono)] sm:text-4xl">
                {formatCurrency(viewTotal)}
              </span>
            </div>
          </div>
          {totalCount > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="kk-pill kk-pill-muted">
                {totalCount} {totalCount === 1 ? "txn" : "txns"}
              </span>
              <span className="kk-pill kk-pill-muted">
                Avg:{" "}
                <span className="font-medium text-[var(--kk-ink)]">
                  {avgToday === null
                    ? "—"
                    : <><span className="kk-rupee">₹</span>{formatCurrency(avgToday, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}</>}
                </span>
              </span>
            </div>
          )}
        </div>
        {pacingBlock}
        {summaryView === "month" && <div className="mt-5">{budgetBlock}</div>}
      </motion.div>

      {hasReceiptEntry && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          {/* <button
            type="button"
            onClick={onReceiptUploadClick}
            disabled={isReceiptProcessing}
            aria-label="Upload receipt"
            className="group flex w-full items-center justify-between gap-4 rounded-[var(--kk-radius-md)] border border-[var(--kk-smoke)] bg-[var(--kk-cream)]/40 px-4 py-4 text-left transition hover:border-[var(--kk-smoke-heavy)] hover:bg-[var(--kk-cream)]/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--kk-smoke)] bg-white/70 text-[var(--kk-ash)]">
                <ImageUp className="h-4 w-4" />
              </span>
              <div>
                <div className="kk-meta mt-0.5">
                  Upload a receipt to auto-fill transactions
                </div>
              </div>
            </div>
          </button> */}
        </motion.div>
      )}

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
          {recentTransactions.length === 0 ? (
            <div className="py-6 text-center text-sm text-[var(--kk-ash)]">
              No recent transactions
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {recentTransactions.map((tx, index) => {
                const processing = isProcessingRow(tx);
                const rowKey = tx.id || `recent-${index}`;
                const date = new Date(tx.timestamp);
                const day = String(date.getDate());
                const month = date
                  .toLocaleDateString("en-IN", { month: "short" })
                  .toUpperCase();
                const label = `${day} ${month}`;
                return (
                  <TransactionRow
                    key={rowKey}
                    tx={tx}
                    index={index}
                    metaVariant="date"
                    metaLabelOverride={label}
                    metaLabelClassName="kk-label text-[var(--kk-ember)]"
                    hasEdit={hasEdit}
                    onEdit={hasEdit ? handleEdit : undefined}
                    onDelete={handleDelete}
                    onOpenMobileSheet={openMobileSheet}
                    formatCurrency={formatCurrency}
                    amountMaxWidthClass="max-w-[24vw]"
                    isProcessing={processing}
                    showActions={!processing}
                  />
                );
              })}
            </AnimatePresence>
          )}
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
        onTogglePrivate={handleTogglePrivate}
        isShared={isMobileSheetShared}
        formatCurrency={formatCurrency}
      />
    </div>
  );
});

TransactionList.displayName = "TransactionList";
