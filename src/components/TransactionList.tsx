"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageUp, BarChart3, Mic, ArrowDown, Sparkles, TrendingUp, TrendingDown, Minus, Calendar } from "lucide-react";
import {
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
  isTransactionShared,
  getDeviceIdentity,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { getRangeForFilter } from "@/src/utils/dates";
import { TransactionRow } from "@/src/components/TransactionRow";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";
import { useCurrency } from "@/src/hooks/useCurrency";
import { useMobileSheet } from "@/src/hooks/useMobileSheet";
import { CATEGORY_ICON_MAP } from "@/src/config/categories";


interface TransactionListProps {
  refreshKey?: number;
  onViewAll?: () => void;
  onEdit?: (tx: Transaction) => void;
  onDeleted?: (tx: Transaction) => void;
  onMicPress?: () => void;
  onReceiptUploadClick?: () => void;
  isReceiptProcessing?: boolean;
  addedTx?: Transaction | null;
  deletedTx?: Transaction | null;
  editedTx?: Transaction | null;
  pendingTransactions?: Transaction[];
  onMobileSheetChange?: (isOpen: boolean) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
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
  onMicPress,
  onReceiptUploadClick,
  isReceiptProcessing = false,
  onEmptyChange,
  addedTx,
  deletedTx,
  editedTx,
  pendingTransactions = [],
  onMobileSheetChange,
}: TransactionListProps) => {
  const { symbol: currencySymbol, formatCurrency } = useCurrency();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  const [thisWeekTxns, setThisWeekTxns] = useState<Transaction[]>([]);
  const [lastWeekTxns, setLastWeekTxns] = useState<Transaction[]>([]);
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
  const [coachmarkDismissed, setCoachmarkDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [topSpendingPeriod, setTopSpendingPeriod] = useState<"week" | "month">("month");

  const isEmpty = transactions.length === 0 && pendingTransactions.length === 0;
  useEffect(() => {
    onEmptyChange?.(isEmpty);
  }, [isEmpty, onEmptyChange]);

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
  const periodTransactionsRef = React.useRef<Transaction[]>([]);
  const hasEdit = Boolean(onEdit);
  const currentMonthKey = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }, []);

  useEffect(() => {
    void (async () => {
      const id = await getDeviceIdentity();
      setIdentity(id);
    })();
  }, []);

  const reloadTransactions = useCallback((isActive?: () => boolean) => {
    if (!identity) return;
    const shouldUpdate = () => (isActive ? isActive() : true);
    if (!hasLoadedOnce.current) setIsLoading(true);
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const beforeNow = eod.getTime() + 1;

    const recentPromise = fetchTransactions({ limit: 5, ownerId: identity.device_id, before: beforeNow })
      .then((items) => {
        if (shouldUpdate()) setTransactions(sortTransactions(items));
      })
      .catch(() => {
        if (shouldUpdate()) setTransactions([]);
      });

    const monthRange = getRangeForFilter("month");
    const rangePromise = monthRange
      ? fetchTransactions({ range: { start: monthRange.start, end: monthRange.end }, ownerId: identity.device_id })
        .then((items) => {
          if (!shouldUpdate()) return;
          startTransition(() => {
            setPeriodTransactions(sortTransactions(items));
          });
        })
        .catch(() => {
          if (shouldUpdate()) {
            startTransition(() => setPeriodTransactions([]));
          }
        })
      : Promise.resolve();

    // Fetch this week and last week for week-over-week comparison
    const now = new Date();
    const dow = now.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;

    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(thisWeekStart.getDate() - mondayOffset);
    thisWeekStart.setHours(0, 0, 0, 0);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
    thisWeekEnd.setHours(23, 59, 59, 999);

    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    lastWeekEnd.setHours(23, 59, 59, 999);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);
    lastWeekStart.setHours(0, 0, 0, 0);

    const thisWeekPromise = fetchTransactions({
      range: { start: thisWeekStart.getTime(), end: thisWeekEnd.getTime() },
      ownerId: identity.device_id,
      before: beforeNow,
    })
      .then((items) => {
        if (shouldUpdate()) setThisWeekTxns(items);
      })
      .catch(() => {
        if (shouldUpdate()) setThisWeekTxns([]);
      });

    const lastWeekPromise = fetchTransactions({
      range: { start: lastWeekStart.getTime(), end: lastWeekEnd.getTime() },
      ownerId: identity.device_id,
      before: beforeNow,
    })
      .then((items) => {
        if (shouldUpdate()) setLastWeekTxns(items);
      })
      .catch(() => {
        if (shouldUpdate()) setLastWeekTxns([]);
      });

    Promise.allSettled([recentPromise, rangePromise, thisWeekPromise, lastWeekPromise]).then(() => {
      if (shouldUpdate()) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    });
  }, [identity]);

  useEffect(() => {
    let active = true;
    reloadTransactions(() => active);
    return () => {
      active = false;
    };
  }, [refreshKey, identity]);

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
    setPeriodTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
  }, [deletedTx]);

  useEffect(() => {
    transactionsRef.current = transactions;
  }, [transactions]);

  useEffect(() => {
    periodTransactionsRef.current = periodTransactions;
  }, [periodTransactions]);

  useEffect(() => {
    if (!editedTx) return;
    setTransactions((prev) =>
      sortTransactions(prev.map((tx) => (tx.id === editedTx.id ? editedTx : tx)))
    );
    setPeriodTransactions((prev) => {
      const range = getRangeForFilter("month");
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
  }, [editedTx]);

  const { viewTotal, topCategories, weekTotal, lastWeekTotal, weekTopCategories } =
    useMemo(() => {
      const filtered = periodTransactions.filter((tx) => !isProcessingRow(tx));
      const total = filtered.reduce((sum, tx) => sum + tx.amount, 0);

      // Category breakdown (month)
      const catMap = new Map<string, number>();
      for (const tx of filtered) {
        catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + tx.amount);
      }
      const cats = [...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      // This week total (separate fetch — covers cross-month weeks)
      const twFiltered = thisWeekTxns.filter((tx) => !isProcessingRow(tx));
      const wt = twFiltered.reduce((sum, tx) => sum + tx.amount, 0);

      const lwFiltered = lastWeekTxns.filter((tx) => !isProcessingRow(tx));
      const lwt = lwFiltered.reduce((sum, tx) => sum + tx.amount, 0);

      // Weekly category breakdown
      const weekCatMap = new Map<string, number>();
      for (const tx of twFiltered) {
        weekCatMap.set(tx.category, (weekCatMap.get(tx.category) ?? 0) + tx.amount);
      }
      const weekCats = [...weekCatMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      return {
        viewTotal: total,
        topCategories: cats,
        weekTotal: wt,
        lastWeekTotal: lwt,
        weekTopCategories: weekCats,
      };
    }, [periodTransactions, thisWeekTxns, lastWeekTxns]);

  const recentTransactions = useMemo(
    () => [...pendingTransactions, ...transactions].slice(0, 5),
    [pendingTransactions, transactions]
  );
  const activeBudget = budgets.monthly;
  const hasBudget = typeof activeBudget === "number" && activeBudget > 0;
  const { remaining, overspend, budgetPercent } = useMemo(() => {
    if (!hasBudget) {
      return { remaining: null, overspend: false, budgetPercent: 0 };
    }
    const raw = activeBudget - viewTotal;
    return {
      remaining: Math.max(raw, 0),
      overspend: raw < 0,
      budgetPercent: Math.min(viewTotal / activeBudget, 1),
    };
  }, [activeBudget, hasBudget, viewTotal]);

  const budgetLabel = "Monthly Budget";
  const resetHintLabel = useMemo(() => {
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
    return `Resets on ${nextMonth.toLocaleDateString("en-IN", {
      month: "short",
      day: "2-digit",
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
  const dismissCoachmark = () => {
    setCoachmarkDismissed(true);
    setBudgets((prev) => {
      const next = { ...prev, coachmarkDismissedMonth: currentMonthKey };
      window.localStorage.setItem("kk_budgets", JSON.stringify(next));
      return next;
    });
  };

  const budgetSurface = (
    <div className="relative overflow-hidden rounded-[var(--kk-radius-md)] bg-gradient-to-br from-white/80 to-[var(--kk-cream)]/60 px-4 py-4 sm:px-5 sm:py-4">
      {/* Subtle decorative corner accent */}
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--kk-ember)]/5 to-transparent" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="kk-label">{budgetLabel}</div>
          <div className="kk-meta mt-1">{resetHintLabel}</div>
        </div>
        <div className="flex-shrink-0">
          {!isEditingBudget && hasBudget && (
            <button
              type="button"
              onClick={openBudgetEditor}
              className="group flex items-center gap-1 text-xs font-medium text-[var(--kk-ember)] transition-colors hover:text-[var(--kk-ember-ink)]"
              aria-label="Edit budget"
            >
              <span className="rounded-full bg-[var(--kk-ember)]/10 px-2 py-1 transition-colors group-hover:bg-[var(--kk-ember)]/20">
                Edit
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-4">
        {isEditingBudget ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="kk-pill bg-white">{currencySymbol}</span>
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
                className="kk-input h-9 text-sm flex-1"
                autoFocus
              />
            </div>
            {budgetError && (
              <div className="kk-meta text-[var(--kk-ember)]">{budgetError}</div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingBudget(false)}
                className="kk-btn-secondary kk-btn-compact"
              >
                {hasBudget ? "Cancel" : "Close"}
              </button>
              <button
                type="button"
                onClick={handleBudgetSave}
                className="kk-btn-primary kk-btn-compact"
              >
                Save
              </button>
            </div>
          </div>
        ) : hasBudget ? (
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="kk-meta">Remaining</span>
              </div>
              <div
                className={`mt-0.5 text-xl font-semibold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ink)]"
                  }`}
              >
                {overspend
                  ? <span>-<span className="kk-currency">{currencySymbol}</span>{formatCurrency(viewTotal - (activeBudget ?? 0))}</span>
                  : <span><span className="kk-currency">{currencySymbol}</span>{formatCurrency(remaining ?? 0)}</span>}
              </div>
              <div className="mt-2 text-xs text-[var(--kk-ash)]">
                of <span className="font-medium text-[var(--kk-ink)]">{currencySymbol}{formatCurrency(activeBudget ?? 0)}</span> total
              </div>
            </div>
            {/* Circular progress indicator */}
            <div className="relative flex-shrink-0">
              <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                {/* Background circle */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="var(--kk-smoke)"
                  strokeWidth="3"
                />
                {/* Progress circle - with minimum visible stroke for small percentages */}
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke={overspend ? "var(--kk-danger)" : "var(--kk-ember)"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={`${Math.max(Math.min(budgetPercent * 100, 100), budgetPercent > 0 ? 3 : 0)}, 100`}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xs font-bold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ember)]"}`}>
                  {Math.round(budgetPercent * 100)}%
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );

  const coachmarkEligible =
    !hasBudget &&
    !isEditingBudget &&
    !coachmarkDismissed;

  const budgetBlock = (() => {
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

  const findTxById = useCallback(
    (id: string) =>
      transactions.find((tx) => tx.id === id) ??
      periodTransactions.find((tx) => tx.id === id) ??
      null,
    [periodTransactions, transactions]
  );

  const handleDelete = useCallback(async (id: string) => {
    const removed = findTxById(id);
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="kk-card relative overflow-hidden">
          {/* Warm radial glow behind mic */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(255,107,53,0.08)_0%,transparent_60%)]" />

          <div className="relative px-6 pt-8 pb-6">
            {/* Mic CTA (A2) */}
            <div className="flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--kk-ember)]/10">
                <Mic className="h-6 w-6 text-[var(--kk-ember)]" strokeWidth={2} />
              </div>

              <h2 className="mt-5 font-[family:var(--font-display)] text-xl font-bold text-[var(--kk-ink)]">
                Say it, we&apos;ll log it
              </h2>
              <p className="mt-1.5 text-sm text-[var(--kk-ash)] max-w-[220px]">
                Tap the mic below and try
              </p>

              {/* Example phrase pill */}
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.35 }}
                className="mt-4 rounded-xl bg-[var(--kk-cream)]/80 border border-[var(--kk-smoke)] px-4 py-2.5"
              >
                <span className="text-sm font-medium text-[var(--kk-ink)]">
                  &ldquo;chai 20 rupees&rdquo;
                </span>
              </motion.div>
            </div>

            {/* Divider — ledger fold */}
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--kk-smoke-heavy)] to-transparent" />
              <Sparkles className="h-3 w-3 text-[var(--kk-saffron)]" />
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--kk-smoke-heavy)] to-transparent" />
            </div>

            {/* Ghost transaction preview (A3) */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.5 }}
            >
              <div className="mb-2.5 flex items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--kk-ash)]">
                  AI fills this for you
                </span>
              </div>

              {/* Mock transaction row */}
              <div className="flex items-center gap-3 rounded-[var(--kk-radius-md)] border border-dashed border-[var(--kk-smoke-heavy)] bg-[var(--kk-cream)]/40 px-4 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--kk-saffron)]/12 text-[var(--kk-saffron)]">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[var(--kk-ink)]">Chai</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="rounded-full bg-[var(--kk-smoke)] px-2 py-0.5 text-[10px] font-medium text-[var(--kk-ash)]">Food</span>
                    <span className="text-[10px] text-[var(--kk-ash)]">Cash</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold font-[family:var(--font-mono)] text-[var(--kk-ink)]">
                    <span className="kk-currency text-sm">{currencySymbol}</span>20
                  </span>
                </div>
              </div>

              <p className="mt-3 text-center text-xs text-[var(--kk-ash)]">
                or type in the bar below
              </p>
            </motion.div>

            {/* Bouncing arrow */}
            <motion.div
              className="mt-3 flex justify-center"
              animate={{ y: [0, 5, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
              <ArrowDown className="h-4 w-4 text-[var(--kk-ash)]/50" />
            </motion.div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Summary Card — month total, budget, week row, categories */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="kk-card overflow-hidden"
      >
        {/* Header: Two-column layout with monthly total + weekly stats */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--kk-cream)]/60 via-white to-[var(--kk-paper)] p-5">
          {/* Decorative gradient orbs */}
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-[var(--kk-ember)]/5 to-transparent blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-gradient-to-tr from-[var(--kk-saffron)]/8 to-transparent blur-2xl" />

          <div className="relative flex flex-row items-start justify-between gap-3">
            {/* Left: Total spent */}
            <div className="flex-1 min-w-0">
              <div className="kk-label mb-2">Total spent</div>
              <div className="flex items-baseline gap-2">
                <span className="kk-currency text-2xl font-bold">{currencySymbol}</span>
                <span className="text-4xl font-bold leading-none tracking-tight font-[family:var(--font-mono)] sm:text-5xl">
                  {formatCurrency(topSpendingPeriod === "month" ? viewTotal : weekTotal)}
                </span>
              </div>
            </div>

            {/* Right: Week/Month toggle */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-1 rounded-full bg-[var(--kk-smoke)]/50 p-0.5">
                <button
                  type="button"
                  onClick={() => setTopSpendingPeriod("week")}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all whitespace-nowrap ${topSpendingPeriod === "week"
                    ? "bg-white text-[var(--kk-ink)] shadow-sm"
                    : "text-[var(--kk-ash)] hover:text-[var(--kk-ink)]"
                    }`}
                >
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  <span>Week</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTopSpendingPeriod("month")}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all whitespace-nowrap ${topSpendingPeriod === "month"
                    ? "bg-white text-[var(--kk-ink)] shadow-sm"
                    : "text-[var(--kk-ash)] hover:text-[var(--kk-ink)]"
                    }`}
                >
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  <span>Month</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Top spending with mini progress bars */}
        {(topCategories.length > 0 || weekTopCategories.length > 0) && (
          <div className="border-t border-[var(--kk-smoke)] bg-gradient-to-r from-white via-[var(--kk-cream)]/20 to-white px-5 py-4">
            {/* Header */}
            <div className="kk-label mb-3 text-[10px]">Top spending</div>

            {/* Categories list */}
            <div className="space-y-3">
              {(topSpendingPeriod === "month" ? topCategories : weekTopCategories).map(
                ([cat, amount], index) => {
                  const Icon =
                    CATEGORY_ICON_MAP[cat as keyof typeof CATEGORY_ICON_MAP] ??
                    CATEGORY_ICON_MAP.Other;
                  const totalForPeriod =
                    topSpendingPeriod === "month" ? viewTotal : weekTotal;
                  const pct =
                    totalForPeriod > 0 ? Math.round((amount / totalForPeriod) * 100) : 0;
                  const colors = [
                    "from-[var(--kk-ember)] to-[var(--kk-saffron)]",
                    "from-[var(--kk-ocean)] to-[var(--kk-ocean)]/70",
                    "from-[var(--kk-sage)] to-[var(--kk-sage)]/70",
                  ];
                  return (
                    <div key={cat} className="group">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ash)]">
                            <Icon className="h-3 w-3" strokeWidth={2} />
                          </span>
                          <span className="text-sm font-medium text-[var(--kk-ink)]">
                            {cat}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-[var(--kk-ink)] font-[family:var(--font-mono)] tabular-nums">
                            {currencySymbol}
                            {formatCurrency(amount)}
                          </span>
                          <span className="text-xs text-[var(--kk-ash)] min-w-[36px] text-right tabular-nums">
                            {pct}%
                          </span>
                        </div>
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--kk-smoke)]">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${colors[index % colors.length]} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
              {/* Empty state for selected period */}
              {(topSpendingPeriod === "month" ? topCategories : weekTopCategories).length === 0 && (
                <div className="py-4 text-center text-xs text-[var(--kk-ash)]">
                  No spending yet this {topSpendingPeriod}
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>

      {/* Budget Card — standalone */}
      {budgetBlock && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.03 }}
          className="px-0"
        >
          {budgetBlock}
        </motion.div>
      )}

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
                <BarChart3 className="h-3.5 w-3.5" />
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
            <AnimatePresence mode="wait">
              {recentTransactions.map((tx, index) => {
                const processing = isProcessingRow(tx);
                const rowKey = tx.id || `recent-${index}`;
                const date = new Date(tx.timestamp);
                const day = String(date.getDate()).padStart(2, "0");
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
                    currencySymbol={currencySymbol}
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
        currencySymbol={currencySymbol}
      />
    </div>
  );
});

TransactionList.displayName = "TransactionList";
