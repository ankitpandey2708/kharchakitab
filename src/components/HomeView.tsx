"use client";

import React, { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, Sparkles, Users } from "lucide-react";
import {
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
  isTransactionShared,
  getDeviceIdentity,
  getPairings,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { getRangeForFilter } from "@/src/utils/dates";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";
import { RecentTransactions } from "@/src/components/RecentTransactions";
import { useCurrency } from "@/src/hooks/useCurrency";
import { useMobileSheet } from "@/src/hooks/useMobileSheet";
import { CATEGORY_ICON_MAP } from "@/src/config/categories";
import { BudgetCard } from "@/src/components/BudgetCard";
import { ApniAwaazBubble } from "@/src/components/ApniAwaazBubble";
import { useApniAwaaz } from "@/src/hooks/useApniAwaaz";
import { syncEvents } from "@/src/services/sync/syncEvents";

import { isProcessingTransaction } from "@/src/utils/transactions";

interface TransactionListProps {
  refreshKey?: number;
  onViewAll?: () => void;
  onEdit?: (tx: Transaction) => void;
  onDeleted?: (tx: Transaction) => void;
  onReceiptUploadClick?: () => void;
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

const canEditTransaction = (tx: Transaction, identity: { device_id: string } | null): boolean => {
  return !identity || tx.owner_device_id === identity.device_id;
};

// Category colors for progress bars
const CATEGORY_COLORS = [
  "from-[var(--kk-ember)] to-[var(--kk-saffron)]",
  "from-[var(--kk-ocean)] to-[var(--kk-ocean)]/70",
  "from-[var(--kk-sage)] to-[var(--kk-sage)]/70",
];

export const HomeView = React.memo(({
  refreshKey,
  onViewAll,
  onEdit,
  onDeleted,
  onReceiptUploadClick,
  onEmptyChange,
  addedTx,
  deletedTx,
  editedTx,
  pendingTransactions = [],
  onMobileSheetChange,
}: TransactionListProps) => {
  const { symbol: currencySymbol, formatCurrency } = useCurrency();
  const apniAwaaz = useApniAwaaz();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [periodTransactions, setPeriodTransactions] = useState<Transaction[]>([]);
  const [identity, setIdentity] = useState<{ device_id: string } | null>(null);
  const [householdData, setHouseholdData] = useState<{
    total: number;
    you: number;
    partner: number;
    partnerName: string;
    transactions: Transaction[];
  } | null>(null);
  const [hasPairingGlobally, setHasPairingGlobally] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMonthOffset, setSelectedMonthOffset] = useState(0);

  const selectedMonthRange = useMemo(() => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + selectedMonthOffset, 1);
    const start = d.getTime();
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    const label = d.toLocaleDateString("en-IN", {
      month: "long",
      ...(selectedMonthOffset < 0 && d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    });
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { start, end, label, monthKey };
  }, [selectedMonthOffset]);

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
  const sharedCache = React.useRef(new Map<string, boolean>());

  const openMobileSheet = useCallback(async (id: string) => {
    if (!sharedCache.current.has(id)) {
      sharedCache.current.set(id, await isTransactionShared(id));
    }
    setIsMobileSheetShared(sharedCache.current.get(id)!);
    baseOpenMobileSheet(id);
  }, [baseOpenMobileSheet]);
  const transactionsRef = React.useRef<Transaction[]>([]);
  const periodTransactionsRef = React.useRef<Transaction[]>([]);
  const hasEdit = Boolean(onEdit);

  // Load identity on mount; refresh pairing state on mount + refreshKey (disconnect triggers new refreshKey)
  useEffect(() => {
    void (async () => {
      const id = await getDeviceIdentity();
      setIdentity(id);
      const pairings = await getPairings();
      setHasPairingGlobally(pairings.length > 0);
    })();
  }, [refreshKey]);

  // Also refresh pairing state on same-tab sync events
  useEffect(() => {
    const refreshPairing = () => {
      void getPairings().then((p) => setHasPairingGlobally(p.length > 0));
    };
    const offRefresh = syncEvents.on("sync:refresh", refreshPairing);
    const offComplete = syncEvents.on("sync:complete", refreshPairing);
    return () => { offRefresh(); offComplete(); };
  }, []);

  const reloadTransactions = useCallback((isActive?: () => boolean) => {
    if (!identity) return;
    const shouldUpdate = () => (isActive ? isActive() : true);
    if (!hasLoadedOnce.current) setIsLoading(true);
    const eod = new Date();
    eod.setHours(23, 59, 59, 999);
    const beforeNow = eod.getTime() + 1;
    const isCurrentMonth = selectedMonthOffset === 0;

    // Track the fetched data to use in setTimeout (avoid stale ref)
    let fetchedMyTx: Transaction[] = [];
    let allPeriodTx: Transaction[] = [];

    const periodAndHouseholdPromise = (async () => {
      allPeriodTx = await fetchTransactions({ range: { start: selectedMonthRange.start, end: selectedMonthRange.end } });
      if (!shouldUpdate()) return;

      fetchedMyTx = allPeriodTx.filter((tx) => tx.owner_device_id === identity.device_id);
      startTransition(() => {
        setPeriodTransactions(sortTransactions(fetchedMyTx));
      });

      const visible = allPeriodTx.filter((tx) => !tx.is_private && !tx.deleted_at);
      if (visible.length === 0) {
        setHouseholdData(null);
        return;
      }

      let you = 0;
      let partner = 0;
      for (const tx of visible) {
        if (tx.owner_device_id === identity.device_id) you += tx.amount;
        else partner += tx.amount;
      }

      const pairings = partner > 0 ? await getPairings() : [];

      setHouseholdData({
        total: you + partner,
        you,
        partner,
        partnerName: pairings[0]?.partner_display_name ?? "Partner",
        transactions: visible,
      });
    })();

    const recentPromise = isCurrentMonth
      ? periodAndHouseholdPromise.then(() => { })
      : fetchTransactions({ range: { start: selectedMonthRange.start, end: selectedMonthRange.end }, limit: 5 })
        .then((items) => {
          if (shouldUpdate()) setTransactions(sortTransactions(items));
        })
        .catch(() => {
          if (shouldUpdate()) setTransactions([]);
        });

    const currentMonthRecentPromise = isCurrentMonth
      ? periodAndHouseholdPromise.then(() => {
        setTimeout(() => {
          if (!shouldUpdate()) return;
          // Use all transactions (self + partner) for recent list
          const latestAllTx = allPeriodTx.length > 0
            ? allPeriodTx
            : transactionsRef.current.filter((tx) =>
              tx.timestamp >= selectedMonthRange.start && tx.timestamp <= selectedMonthRange.end
            );
          const recentFromPeriod = latestAllTx.slice(0, 5);
          if (recentFromPeriod.length > 0) {
            setTransactions(sortTransactions(recentFromPeriod));
          } else {
            fetchTransactions({ limit: 5, before: beforeNow })
              .then((items) => {
                if (shouldUpdate()) setTransactions(sortTransactions(items));
              })
              .catch(() => {
                if (shouldUpdate()) setTransactions([]);
              });
          }
        }, 0);
      })
      : Promise.resolve();

    Promise.allSettled([recentPromise, currentMonthRecentPromise, periodAndHouseholdPromise]).then(() => {
      if (shouldUpdate()) {
        hasLoadedOnce.current = true;
        setIsLoading(false);
      }
    });
  }, [identity, selectedMonthRange, selectedMonthOffset]);

  useEffect(() => {
    let active = true;
    reloadTransactions(() => active);
    return () => {
      active = false;
    };
  }, [refreshKey, identity, selectedMonthRange]);

  useEffect(() => {
    if (!deletedTx) return;
    setTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
    setPeriodTransactions((prev) => prev.filter((tx) => tx.id !== deletedTx.id));
    setHouseholdData((prev) => {
      if (!prev) return prev;
      const wasInHousehold = prev.transactions.some((tx) => tx.id === deletedTx.id);
      if (!wasInHousehold) return prev;
      const newTransactions = prev.transactions.filter((tx) => tx.id !== deletedTx.id);
      const wasYourTx = deletedTx.owner_device_id === identity?.device_id;
      return {
        ...prev,
        total: prev.total - deletedTx.amount,
        you: wasYourTx ? prev.you - deletedTx.amount : prev.you,
        partner: wasYourTx ? prev.partner : prev.partner - deletedTx.amount,
        transactions: newTransactions,
      };
    });
  }, [deletedTx, identity]);

  useEffect(() => {
    if (!addedTx) return;
    setTransactions((prev) => {
      if (prev.some((tx) => tx.id === addedTx.id)) return prev;
      return sortTransactions([addedTx, ...prev]);
    });
    setHouseholdData((prev) => {
      if (!prev) return prev;
      const isYourTx = addedTx.owner_device_id === identity?.device_id;
      const range = getRangeForFilter("month");
      const inRange = range ? isInRange(addedTx.timestamp, range) : false;
      if (
        !addedTx.is_private &&
        !addedTx.deleted_at &&
        inRange &&
        !prev.transactions.some((tx) => tx.id === addedTx.id)
      ) {
        return {
          ...prev,
          total: prev.total + addedTx.amount,
          you: isYourTx ? prev.you + addedTx.amount : prev.you,
          partner: isYourTx ? prev.partner : prev.partner + addedTx.amount,
          transactions: [...prev.transactions, addedTx],
        };
      }
      return prev;
    });
  }, [addedTx, identity]);

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
    setHouseholdData((prev) => {
      if (!prev) return prev;
      const existingIndex = prev.transactions.findIndex((tx) => tx.id === editedTx.id);
      const isYourTx = editedTx.owner_device_id === identity?.device_id;
      const wasYourTx = existingIndex >= 0 ? prev.transactions[existingIndex].owner_device_id === identity?.device_id : isYourTx;
      const oldAmount = existingIndex >= 0 ? prev.transactions[existingIndex].amount : 0;
      const newAmount = editedTx.amount;
      const amountDiff = newAmount - oldAmount;
      const shouldBeInHousehold = !editedTx.is_private && !editedTx.deleted_at;
      const wasInHousehold = existingIndex >= 0;

      if (!wasInHousehold && shouldBeInHousehold) {
        return {
          ...prev,
          total: prev.total + newAmount,
          you: isYourTx ? prev.you + newAmount : prev.you,
          partner: isYourTx ? prev.partner : prev.partner + newAmount,
          transactions: [...prev.transactions, editedTx],
        };
      } else if (wasInHousehold && !shouldBeInHousehold) {
        const newTransactions = prev.transactions.filter((tx) => tx.id !== editedTx.id);
        return {
          ...prev,
          total: prev.total - oldAmount,
          you: wasYourTx ? prev.you - oldAmount : prev.you,
          partner: wasYourTx ? prev.partner : prev.partner - oldAmount,
          transactions: newTransactions,
        };
      } else if (wasInHousehold && shouldBeInHousehold) {
        const newTransactions = prev.transactions.map((tx) =>
          tx.id === editedTx.id ? editedTx : tx
        );
        return {
          ...prev,
          total: prev.total + amountDiff,
          you: isYourTx ? prev.you + amountDiff : prev.you,
          partner: isYourTx ? prev.partner : prev.partner + amountDiff,
          transactions: newTransactions,
        };
      }
      return prev;
    });
  }, [editedTx, identity]);

  const householdCategories = useMemo(() => {
    if (!householdData || householdData.transactions.length === 0) return [];
    const catMap = new Map<string, { total: number; you: number }>();
    for (const tx of householdData.transactions) {
      if (isProcessingTransaction(tx)) continue;
      const existing = catMap.get(tx.category) ?? { total: 0, you: 0 };
      existing.total += tx.amount;
      if (tx.owner_device_id === identity?.device_id) {
        existing.you += tx.amount;
      }
      catMap.set(tx.category, existing);
    }
    return [...catMap.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 3);
  }, [householdData, identity]);

  const viewTotal = useMemo(() => {
    return periodTransactions
      .filter((tx) => !isProcessingTransaction(tx))
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [periodTransactions]);

  const topCategories = useMemo(() => {
    const catMap = new Map<string, number>();
    for (const tx of periodTransactions) {
      if (isProcessingTransaction(tx)) continue;
      catMap.set(tx.category, (catMap.get(tx.category) ?? 0) + tx.amount);
    }
    return [...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [periodTransactions]);

  // SIMPLIFIED: Single computed summary object
  const summary = useMemo(() => {
    if (!hasPairingGlobally) {
      return {
        mode: 'solo' as const,
        total: viewTotal,
        categories: topCategories.map(([name, total]) => ({
          name,
          total,
          yourShare: total,
          partnerShare: 0,
        })),
      };
    }

    const total = householdData?.total ?? viewTotal;
    const yourShare = householdData?.you ?? viewTotal;
    const partnerShare = householdData?.partner ?? 0;
    const partnerName = householdData?.partnerName ?? 'Partner';

    return {
      mode: 'household' as const,
      total,
      yourShare,
      partnerShare,
      partnerName,
      categories: householdCategories.map(([name, data]) => ({
        name,
        total: data.total,
        yourShare: data.you,
        partnerShare: data.total - data.you,
      })),
    };
  }, [hasPairingGlobally, householdData, viewTotal, topCategories, householdCategories]);

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
      if (shared && nextPrivate) return;
      const tx = findTxById(id);
      if (!tx) return;
      await updateTransaction(id, { is_private: nextPrivate });
      reloadTransactions();
    },
    [findTxById, reloadTransactions]
  );

  const mobileSheetTx = mobileSheetTxId ? findTxById(mobileSheetTxId) : null;
  const hasReceiptEntry = Boolean(onReceiptUploadClick);

  const yourSharePercent = summary.total > 0
    ? Math.round(((summary.mode === 'solo' ? summary.total : summary.yourShare) / summary.total) * 100)
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="kk-card h-36 animate-pulse bg-[var(--kk-mist)]/50 sm:h-44" />
        <div className="kk-card h-64 animate-pulse bg-[var(--kk-mist)]/50" />
      </div>
    );
  }

  if (selectedMonthOffset === 0 && transactions.length === 0 && pendingTransactions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      >
        <div className="kk-card relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_center,rgba(255,107,53,0.08)_0%,transparent_60%)]" />
          <div className="relative px-6 pt-4 pb-6">
            <div className="flex flex-col items-center text-center">
              <h2 className="mt-2 font-[family:var(--font-display)] text-xl font-bold text-[var(--kk-ink)]">
                Say it, we'll log it
              </h2>
              <p className="mt-1.5 text-sm text-[var(--kk-ash)] max-w-[220px]">
                Tap the mic below and try
              </p>
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
            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--kk-smoke-heavy)] to-transparent" />
              <Sparkles className="h-3 w-3 text-[var(--kk-saffron)]" />
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[var(--kk-smoke-heavy)] to-transparent" />
            </div>
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
      {/* Apni Awaaz — daily spending insight */}
      {!apniAwaaz.isDismissed && (apniAwaaz.message || apniAwaaz.isLoading) && (
        <ApniAwaazBubble
          message={apniAwaaz.message!}
          isLoading={apniAwaaz.isLoading}
          onDismiss={apniAwaaz.dismiss}
        />
      )}

      {/* Unified Summary Card — simplified logic */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="kk-card overflow-hidden"
      >
        {/* Header: Monthly total */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--kk-cream)]/60 via-white to-[var(--kk-paper)] p-5">
          <div className="absolute -right-20 -top-20 h-48 w-48 rounded-full bg-gradient-to-br from-[var(--kk-ember)]/5 to-transparent blur-3xl" />
          <div className="absolute -left-10 -bottom-10 h-32 w-32 rounded-full bg-gradient-to-tr from-[var(--kk-saffron)]/8 to-transparent blur-2xl" />

          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <span className="kk-label">Total spent</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectedMonthOffset((o) => Math.max(o - 1, -12))}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span className="kk-label min-w-[60px] text-center">{selectedMonthRange.label}</span>
                <button
                  type="button"
                  onClick={() => setSelectedMonthOffset((o) => Math.min(o + 1, 0))}
                  disabled={selectedMonthOffset === 0}
                  className="flex h-5 w-5 items-center justify-center rounded text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors disabled:opacity-30 disabled:cursor-default"
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="kk-currency text-2xl font-bold">{currencySymbol}</span>
              <span className="text-4xl font-bold leading-none tracking-tight font-[family:var(--font-mono)] sm:text-5xl">
                {formatCurrency(summary.total)}
              </span>
            </div>

            {/* Your share - only in household mode */}
            {summary.mode === 'household' && (
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[var(--kk-ash)]">
                  Your share: <span className="font-medium text-[var(--kk-ink)]">
                    <span className="kk-currency">{currencySymbol}</span>
                    {formatCurrency(summary.yourShare)}
                  </span>
                  <span className="ml-1 text-xs">({yourSharePercent}%)</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Household split bar - only in household mode */}
        {summary.mode === 'household' && (
          <div className="border-t border-[var(--kk-smoke)] bg-gradient-to-r from-[var(--kk-cream)]/40 via-white to-[var(--kk-cream)]/40 px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--kk-ocean)]/10">
                <Users className="h-3.5 w-3.5 text-[var(--kk-ocean)]" />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--kk-ash)]">Split</span>
            </div>

            {/* Stacked split bar - always shows both portions */}
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--kk-smoke-heavy)]">
              <div
                className="h-full bg-[var(--kk-ocean)] transition-all duration-700"
                style={{ width: `${summary.total > 0 ? (summary.yourShare / summary.total) * 100 : 100}%` }}
              />
              <div
                className="h-full bg-gradient-to-r from-[var(--kk-ember)] to-[var(--kk-saffron)] transition-all duration-700"
                style={{ width: `${summary.total > 0 ? (summary.partnerShare / summary.total) * 100 : 0}%` }}
              />
            </div>

            {/* Split legend - simplified 2-state */}
            <div className="mt-2.5 flex justify-between text-xs">
              <span className="flex items-center gap-1.5 text-[var(--kk-ink)]">
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--kk-ocean)]" />
                You · {currencySymbol}{formatCurrency(summary.yourShare)}
              </span>
              <span className="flex items-center gap-1.5 text-[var(--kk-ash)]">
                {summary.partnerName} · {currencySymbol}{formatCurrency(summary.partnerShare)}
                <span className="inline-block h-2 w-2 rounded-full bg-[var(--kk-ember)]" />
              </span>
            </div>
          </div>
        )}

        {/* Top spending categories */}
        <div
          className={`border-t border-[var(--kk-smoke)] bg-gradient-to-r from-white via-[var(--kk-cream)]/20 to-white px-5 py-4${onViewAll ? " cursor-pointer" : ""}`}
          onClick={onViewAll}
          role={onViewAll ? "button" : undefined}
        >
          <div className="kk-label mb-3 text-[10px]">Top spending</div>
          <div className="space-y-4">
            {summary.categories.length > 0 ? (
              summary.categories.map((cat, index) => {
                const Icon = CATEGORY_ICON_MAP[cat.name as keyof typeof CATEGORY_ICON_MAP] ?? CATEGORY_ICON_MAP.Other;
                const pct = summary.total > 0 ? Math.round((cat.total / summary.total) * 100) : 0;
                const yourSharePct = cat.total > 0 ? Math.round((cat.yourShare / cat.total) * 100) : 0;
                return (
                  <div key={cat.name} className="group">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ash)]">
                          <Icon className="h-3 w-3" strokeWidth={2} />
                        </span>
                        <span className="text-sm font-medium text-[var(--kk-ink)]">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-[var(--kk-ink)] font-[family:var(--font-mono)] tabular-nums">
                          {currencySymbol}{formatCurrency(cat.total)}
                        </span>
                        <span className="text-xs text-[var(--kk-ash)] min-w-[36px] text-right tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--kk-smoke)] mb-1.5">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${CATEGORY_COLORS[index % CATEGORY_COLORS.length]} transition-all duration-500`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {/* Your share - only in household mode */}
                    {summary.mode === 'household' && (
                      <div className="text-[10px] text-[var(--kk-ash)]">
                        Your share: <span className="text-[var(--kk-ocean)] font-medium">
                          {currencySymbol}{formatCurrency(cat.yourShare)}
                        </span> ({yourSharePct}%)
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="flex items-center justify-center min-h-[42px] text-center text-xs text-[var(--kk-ash)]">
                No spending recorded this month
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Budget Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="px-0"
      >
        <BudgetCard
          currencySymbol={currencySymbol}
          formatCurrency={formatCurrency}
          viewTotal={viewTotal}
          selectedMonthKey={selectedMonthRange.monthKey}
          isHousehold={hasPairingGlobally}
          householdTotal={householdData?.total}
          deviceId={identity?.device_id}
          partnerName={householdData?.partnerName}
        />
      </motion.div>

      {hasReceiptEntry && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        />
      )}

      <RecentTransactions
        pendingTransactions={pendingTransactions}
        transactions={transactions}
        identity={identity}
        partnerName={householdData && householdData.partner > 0 ? householdData.partnerName : undefined}
        hasEdit={hasEdit}
        onViewAll={onViewAll}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onOpenMobileSheet={openMobileSheet}
        currencySymbol={currencySymbol}
        formatCurrency={formatCurrency}
      />

      <TransactionActionSheet
        isOpen={isMobileSheetOpen}
        tx={mobileSheetTx}
        hasEdit={hasEdit && (mobileSheetTx ? canEditTransaction(mobileSheetTx, identity) : false)}
        confirmDelete={mobileConfirmDelete}
        setConfirmDelete={setMobileConfirmDelete}
        onClose={closeMobileSheet}
        onEdit={hasEdit && mobileSheetTx && canEditTransaction(mobileSheetTx, identity) ? handleEdit : undefined}
        onDelete={mobileSheetTx && canEditTransaction(mobileSheetTx, identity) ? handleDelete : undefined}
        onTogglePrivate={handleTogglePrivate}
        isShared={isMobileSheetShared}
        formatCurrency={formatCurrency}
        currencySymbol={currencySymbol}
      />
    </div>
  );
});

HomeView.displayName = "HomeView";
