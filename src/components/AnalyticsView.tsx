// PERF-VIRTUAL: Added virtualization for large transaction lists using @tanstack/react-virtual
// PERF-COMPUTE: Added useMemo for heavy array operations on transaction data

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft, Fingerprint, Handshake } from "lucide-react";
import {
  deleteTransaction,
  fetchTransactions,
  updateTransaction,
  isTransactionShared,
  getDeviceIdentity,
  getPairings,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";
import { TransactionRow } from "@/src/components/TransactionRow";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";
import { useCurrency } from "@/src/hooks/useCurrency";
import { useMobileSheet } from "@/src/hooks/useMobileSheet";
import { useSummaryViewSync } from "@/src/hooks/useSummaryViewSync";
import { HistoryFilters } from "@/src/components/Filters";
import { ImportModal } from "@/src/components/ImportModal";
import {
  MetricsDashboard,
  type ChartMeta,
  type DonutSegment,
} from "@/src/components/MetricsDashboard";
import posthog from "posthog-js";

const HISTORY_PAGE_SIZE = 30;

type SummaryView = "today" | "month";

interface AnalyticsViewProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (tx: Transaction) => void;
  onEdit?: (tx: Transaction) => void;
  editedTx?: Transaction | null;
  refreshKey?: number;
}

const mapFilterToSummaryView = (value: FilterKey): SummaryView =>
  value === "today" ? "today" : "month";


const getInitialFilter = (): FilterKey => {
  if (typeof window === "undefined") return "month";
  const stored = window.localStorage.getItem("kk_summary_view");
  if (stored === "today" || stored === "last7" || stored === "last30" || stored === "month" || stored === "lastMonth") {
    return stored;
  }
  return "month";
};

export const AnalyticsView = React.memo(({
  isOpen,
  onClose,
  onDeleted,
  onEdit,
  editedTx,
  refreshKey,
}: AnalyticsViewProps) => {
  const { symbol: currencySymbol, formatCurrency: formatCurrencyUtil } = useCurrency();
  const [filter, setFilter] = useState<FilterKey>(getInitialFilter);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "me" | "partner">("all");
  const listRef = useRef<HTMLDivElement | null>(null);
  // PERF-VIRTUAL: Ref for virtualized list container
  const virtualListRef = useRef<HTMLDivElement | null>(null);
  const listRequestRef = useRef(0);
  const skipSummarySyncRef = useRef(false);
  const filterRef = useRef<FilterKey>(filter);
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);
  const handleSummaryReceive = useCallback((value: SummaryView) => {
    setFilter((prev) => {
      if (prev === value) return prev;
      skipSummarySyncRef.current = true;
      return value;
    });
  }, []);
  const { syncSummaryView } = useSummaryViewSync<SummaryView>({
    enabled: isOpen,
    listen: false,
    parse: (value) =>
      value === "today" || value === "month"
        ? value
        : null,
    onReceive: handleSummaryReceive,
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [debouncedCustomStart, setDebouncedCustomStart] = useState("");
  const [debouncedCustomEnd, setDebouncedCustomEnd] = useState("");
  const [renderLimit, setRenderLimit] = useState(200);
  const {
    isOpen: isMobileSheetOpen,
    activeId: mobileSheetTxId,
    confirmDelete: mobileConfirmDelete,
    setConfirmDelete: setMobileConfirmDelete,
    openSheet: baseOpenMobileSheet,
    closeSheet: closeMobileSheet,
  } = useMobileSheet();
  const [isMobileSheetShared, setIsMobileSheetShared] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  const openMobileSheet = useCallback(async (id: string) => {
    const shared = await isTransactionShared(id);
    setIsMobileSheetShared(shared);
    baseOpenMobileSheet(id);
  }, [baseOpenMobileSheet]);

  const hasEdit = Boolean(onEdit);

  const metricsCacheRef = useRef(
    new Map<
      string,
      {
        rangeTransactions: Transaction[];
        trendMetrics: {
          totalBase: number;
          totalPrev: number;
          delta: number;
          dailyTotals: number[];
          dailyCounts: number[];
          baseCount: number;
          prevCount: number;
          days: number;
          series: { x: number; y: number }[];
          bucket: "hour" | "day";
        };
        trendRangeLabels: { current: string; previous: string };
      }
    >()
  );

  useEffect(() => {
    if (isOpen) return;
    closeMobileSheet();
  }, [closeMobileSheet, isOpen]);

  // Get current device ID and partner name on mount
  useEffect(() => {
    void (async () => {
      const [identity, pairings] = await Promise.all([getDeviceIdentity(), getPairings()]);
      setCurrentDeviceId(identity.device_id);
      setPartnerName(pairings[0]?.partner_display_name ?? null);
    })();
  }, []);

  const [allocationMode, setAllocationMode] = useState<"amount" | "count">(
    "amount"
  );
  const [rangeTransactions, setRangeTransactions] = useState<Transaction[]>([]);
  const [trendMetrics, setTrendMetrics] = useState<{
    totalBase: number;
    totalPrev: number;
    delta: number;
    dailyTotals: number[];
    dailyCounts: number[];
    baseCount: number;
    prevCount: number;
    days: number;
    series: { x: number; y: number }[];
    bucket: "hour" | "day";
  }>({
    totalBase: 0,
    totalPrev: 0,
    delta: 0,
    dailyTotals: [],
    dailyCounts: [],
    baseCount: 0,
    prevCount: 0,
    days: 0,
    series: [],
    bucket: "day",
  });
  const [trendRangeLabels, setTrendRangeLabels] = useState<{
    current: string;
    previous: string;
  }>({ current: "", previous: "" });
  const [allocationMetrics, setAllocationMetrics] = useState<{
    totalRange: number;
    topCategory: string | null;
    topShare: number;
    topCategories: { label: string; total: number }[];
    rangeCount: number;
  }>({
    totalRange: 0,
    topCategory: null,
    topShare: 0,
    topCategories: [],
    rangeCount: 0,
  });

  const range = useMemo(
    () => getRangeForFilter(filter, { customStart: debouncedCustomStart, customEnd: debouncedCustomEnd }),
    [filter, debouncedCustomStart, debouncedCustomEnd]
  );

  const changeRange = useMemo(() => {
    if (filter === "custom") return range;
    return getRangeForFilter(filter);
  }, [filter, range]);

  useEffect(() => {
    if (filter === "custom") return;
    const nextRange = getRangeForFilter(filter);
    if (!nextRange) return;
    const startVal = toDateInputValue(nextRange.start);
    const endVal = toDateInputValue(nextRange.end);
    setCustomStart(startVal);
    setCustomEnd(endVal);
    setDebouncedCustomStart(startVal);
    setDebouncedCustomEnd(endVal);
  }, [filter]);

  const fetchPage = useCallback(
    (cursorValue?: number) =>
      range
        ? fetchTransactions({
          range: { start: range.start, end: range.end },
          limit: HISTORY_PAGE_SIZE,
          before: cursorValue,
        })
        : Promise.resolve([] as Transaction[]),
    [range, currentDeviceId]
  );

  const loadFirstPage = useCallback(async () => {
    const requestId = ++listRequestRef.current;
    setIsLoading(true);
    setCursor(undefined);
    try {
      const data = await fetchPage();
      if (listRequestRef.current !== requestId) return;
      setItems(data);
      setHasMore(data.length >= HISTORY_PAGE_SIZE);
      setCursor(data.length ? data[data.length - 1].timestamp : undefined);
    } finally {
      if (listRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading) return;
    const requestId = listRequestRef.current;
    setIsLoading(true);
    try {
      const data = await fetchPage(cursor);
      if (listRequestRef.current !== requestId) return;
      setItems((prev) => [...prev, ...data]);
      setHasMore(data.length >= HISTORY_PAGE_SIZE);
      setCursor(data.length ? data[data.length - 1].timestamp : cursor);
    } finally {
      if (listRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [cursor, fetchPage, hasMore, isLoading]);

  useEffect(() => {
    if (!isOpen) return;
    if (skipSummarySyncRef.current) {
      skipSummarySyncRef.current = false;
      return;
    }
    if (filter !== "today" && filter !== "month") return;
    syncSummaryView(mapFilterToSummaryView(filter));
  }, [filter, isOpen, syncSummaryView]);

  // E: loadFirstPage effect removed — metrics effect populates items directly

  useEffect(() => {
    if (!isOpen) return;
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [filter, query, isOpen]);

  useEffect(() => {
    if (!editedTx) return;
    setItems((prev) =>
      prev.map((tx) => (tx.id === editedTx.id ? editedTx : tx))
    );
    setMetricsVersion((prev) => prev + 1);
  }, [editedTx]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedCustomStart(customStart);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [customStart]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedCustomEnd(customEnd);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [customEnd]);

  const formatCurrency = formatCurrencyUtil;

  const formatRangeLabel = useCallback((start: number, end: number) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const sameDay =
      startDate.getFullYear() === endDate.getFullYear() &&
      startDate.getMonth() === endDate.getMonth() &&
      startDate.getDate() === endDate.getDate();
    const showYear = startDate.getFullYear() !== endDate.getFullYear();
    const format = (date: Date) =>
      date.toLocaleDateString(
        "en-IN",
        showYear
          ? { month: "short", day: "2-digit", year: "numeric" }
          : { month: "short", day: "2-digit" }
      );
    if (sameDay) return format(startDate);
    return `${format(startDate)} - ${format(endDate)}`;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const loadMetrics = async () => {
      const cacheKey = [
        "metrics",
        changeRange?.start ?? "none",
        changeRange?.end ?? "none",
        range?.start ?? "none",
        range?.end ?? "none",
        filter,
        ownerFilter,
        metricsVersion,
      ].join("|");
      const cached = metricsCacheRef.current.get(cacheKey);
      if (cached) {
        // Batch all state updates in a single callback to avoid cascading re-renders
        React.startTransition(() => {
          setRangeTransactions(cached.rangeTransactions);
          setTrendMetrics(cached.trendMetrics);
          setTrendRangeLabels(cached.trendRangeLabels);
          setItems(cached.rangeTransactions);
          setHasMore(false);
          setIsMetricsLoading(false);
          setIsLoading(false);
        });
        return;
      }
      setIsMetricsLoading(true);
      setIsLoading(true);
      try {
        const base = changeRange;
        const MS_DAY = 24 * 60 * 60 * 1000;
        const baseStartDay = base ? new Date(base.start) : null;
        const baseEndDay = base ? new Date(base.end) : null;
        if (baseStartDay) baseStartDay.setHours(0, 0, 0, 0);
        if (baseEndDay) baseEndDay.setHours(0, 0, 0, 0);
        const days =
          baseStartDay && baseEndDay
            ? Math.max(
              1,
              Math.round(
                (baseEndDay.getTime() - baseStartDay.getTime()) / MS_DAY
              ) + 1
            )
            : 0;
        const prevEndDay = baseStartDay ? new Date(baseStartDay) : null;
        if (prevEndDay) prevEndDay.setDate(prevEndDay.getDate() - 1);
        const prevStartDay = prevEndDay ? new Date(prevEndDay) : null;
        if (prevStartDay && days > 1) {
          prevStartDay.setDate(prevStartDay.getDate() - (days - 1));
        }
        const prevRange =
          prevStartDay && prevEndDay
            ? {
              start: new Date(
                prevStartDay.getFullYear(),
                prevStartDay.getMonth(),
                prevStartDay.getDate(),
                0,
                0,
                0,
                0
              ).getTime(),
              end: new Date(
                prevEndDay.getFullYear(),
                prevEndDay.getMonth(),
                prevEndDay.getDate(),
                23,
                59,
                59,
                999
              ).getTime(),
            }
            : null;

        const baseTransactionsPromise = base
          ? fetchTransactions({ range: { start: base.start, end: base.end } })
          : Promise.resolve([] as Transaction[]);
        const prevTransactionsPromise = prevRange
          ? fetchTransactions({ range: { start: prevRange.start, end: prevRange.end } })
          : Promise.resolve([] as Transaction[]);
        const rangeMatchesBase =
          !!base &&
          !!range &&
          base.start === range.start &&
          base.end === range.end;
        const rangeTransactionsPromise =
          range && !rangeMatchesBase
            ? fetchTransactions({ range: { start: range.start, end: range.end } })
            : Promise.resolve([] as Transaction[]);

        const [baseTransactions, prevTransactions, rangeTransactions] =
          await Promise.all([
            baseTransactionsPromise,
            prevTransactionsPromise,
            rangeTransactionsPromise,
          ]);

        // Apply owner filter to transactions for trend chart
        const filterByOwner = (txs: Transaction[]) => {
          if (ownerFilter === "all") return txs;
          if (ownerFilter === "me") return txs.filter((tx) => tx.owner_device_id === currentDeviceId);
          return txs.filter((tx) => tx.owner_device_id !== currentDeviceId);
        };

        const filteredBaseTransactions = filterByOwner(baseTransactions);
        const filteredPrevTransactions = filterByOwner(prevTransactions);
        const resolvedRangeTransactions = rangeMatchesBase
          ? baseTransactions
          : rangeTransactions;

        const useHourly = days <= 1;
        const dayKeys =
          baseStartDay && days > 0
            ? Array.from({ length: days }, (_, index) => {
              const date = new Date(baseStartDay);
              date.setDate(date.getDate() + index);
              date.setHours(0, 0, 0, 0);
              return date.getTime();
            })
            : [];
        const hourKeys =
          baseStartDay && useHourly
            ? Array.from({ length: 24 }, (_, index) => {
              const date = new Date(baseStartDay);
              date.setHours(index, 0, 0, 0);
              return date.getTime();
            })
            : [];
        const dayIndex = new Map<number, number>(
          dayKeys.map((key, index) => [key, index])
        );
        const hourIndex = new Map<number, number>(
          hourKeys.map((key, index) => [key, index])
        );
        const dailyTotals = Array(days).fill(0);
        const dailyCounts = Array(days).fill(0);
        const hourlyTotals = Array(useHourly ? 24 : 0).fill(0);
        const hourlyCounts = Array(useHourly ? 24 : 0).fill(0);
        filteredBaseTransactions.forEach((tx) => {
          const date = new Date(tx.timestamp);
          if (useHourly) {
            const key = new Date(
              date.getFullYear(),
              date.getMonth(),
              date.getDate(),
              date.getHours(),
              0,
              0,
              0
            ).getTime();
            const idx = hourIndex.get(key);
            if (idx === undefined) return;
            hourlyTotals[idx] += tx.amount;
            hourlyCounts[idx] += 1;
            return;
          }
          const key = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate()
          ).getTime();
          const idx = dayIndex.get(key);
          if (idx === undefined) return;
          dailyTotals[idx] += tx.amount;
          dailyCounts[idx] += 1;
        });

        const totalBase = filteredBaseTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0
        );
        const totalPrev = filteredPrevTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0
        );
        const baseCount = filteredBaseTransactions.length;
        const prevCount = filteredPrevTransactions.length;
        const dailySeriesTotals = useHourly ? hourlyTotals : dailyTotals;
        const delta = totalBase - totalPrev;
        const series = useHourly
          ? hourKeys.map((key, index) => ({ x: key, y: hourlyTotals[index] }))
          : dayKeys.map((key, index) => ({ x: key, y: dailyTotals[index] }));

        if (!active) return;
        const currentLabel = base ? formatRangeLabel(base.start, base.end) : "";
        const previousLabel = prevRange
          ? formatRangeLabel(prevRange.start, prevRange.end)
          : "";
        const computedTrendMetrics = {
          totalBase,
          totalPrev,
          delta,
          dailyTotals: dailySeriesTotals,
          dailyCounts: useHourly ? hourlyCounts : dailyCounts,
          baseCount,
          prevCount,
          days,
          series,
          bucket: (useHourly ? "hour" : "day") as "hour" | "day",
        };
        const computedLabels = { current: currentLabel, previous: previousLabel };
        // Batch all state updates to avoid cascading re-renders
        React.startTransition(() => {
          setRangeTransactions(resolvedRangeTransactions);
          setItems(resolvedRangeTransactions);
          setHasMore(false);
          setTrendMetrics(computedTrendMetrics);
          setTrendRangeLabels(computedLabels);
        });
        metricsCacheRef.current.set(cacheKey, {
          rangeTransactions: resolvedRangeTransactions,
          trendMetrics: {
            totalBase,
            totalPrev,
            delta,
            dailyTotals: dailySeriesTotals,
            dailyCounts: useHourly ? hourlyCounts : dailyCounts,
            baseCount,
            prevCount,
            days,
            series,
            bucket: useHourly ? "hour" : "day",
          },
          trendRangeLabels: { current: currentLabel, previous: previousLabel },
        });
      } finally {
        if (active) {
          setIsMetricsLoading(false);
          setIsLoading(false);
        }
      }
    };
    void loadMetrics();
    return () => {
      active = false;
    };
  }, [
    changeRange,
    currentDeviceId,
    filter,
    formatRangeLabel,
    isOpen,
    metricsVersion,
    ownerFilter,
    range,
    refreshKey,
  ]);

  useEffect(() => {
    if (!isOpen) return;

    // Apply owner filter for pie chart
    const filteredRangeTransactions = rangeTransactions.filter((tx) => {
      if (ownerFilter === "all") return true;
      if (ownerFilter === "me") return tx.owner_device_id === currentDeviceId;
      return tx.owner_device_id !== currentDeviceId;
    });

    const categoryTotals = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    filteredRangeTransactions.forEach((tx) => {
      categoryTotals.set(
        tx.category,
        (categoryTotals.get(tx.category) ?? 0) + tx.amount
      );
      categoryCounts.set(
        tx.category,
        (categoryCounts.get(tx.category) ?? 0) + 1
      );
    });

    const totalRange =
      allocationMode === "amount"
        ? filteredRangeTransactions.reduce((sum, tx) => sum + tx.amount, 0)
        : filteredRangeTransactions.length;
    const rangeCount = filteredRangeTransactions.length;
    const sourceMap =
      allocationMode === "amount" ? categoryTotals : categoryCounts;
    const sortedCategories = Array.from(sourceMap.entries()).sort(
      (a, b) => b[1] - a[1]
    );
    const topCategoryEntry = sortedCategories[0];
    const topCategory = topCategoryEntry ? topCategoryEntry[0] : null;
    const topCategoryTotal = topCategoryEntry ? topCategoryEntry[1] : 0;
    const topShare = totalRange > 0 ? topCategoryTotal / totalRange : 0;
    const topCategories = sortedCategories.slice(0, 3).map(([label, total]) => ({
      label,
      total,
    }));
    setAllocationMetrics({
      totalRange,
      topCategory,
      topShare,
      topCategories,
      rangeCount,
    });
  }, [allocationMode, currentDeviceId, isOpen, ownerFilter, rangeTransactions]);

  useEscapeKey(isOpen && !isMobileSheetOpen, onClose);

  const filteredItems = useMemo(() => {
    // Exclude partner's private transactions — never visible to other devices
    let result = items.filter(
      (tx) => tx.owner_device_id === currentDeviceId || !tx.is_private
    );
    // Owner filter
    if (ownerFilter === "me") {
      result = result.filter((tx) => tx.owner_device_id === currentDeviceId);
    } else if (ownerFilter === "partner") {
      result = result.filter((tx) => tx.owner_device_id !== currentDeviceId);
    }
    // Search
    if (!debouncedQuery.trim()) return result;
    const q = debouncedQuery.toLowerCase();
    return result.filter((tx) =>
      `${tx.item} ${tx.category} ${tx.amount}`.toLowerCase().includes(q)
    );
  }, [currentDeviceId, debouncedQuery, items, ownerFilter]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, renderLimit),
    [filteredItems, renderLimit]
  );

  useEffect(() => {
    setRenderLimit(200);
    if (filteredItems.length <= 200) return;
    let cancelled = false;
    let timeoutId: number | null = null;
    const step = () => {
      if (cancelled) return;
      setRenderLimit((prev) => {
        if (prev >= filteredItems.length) return prev;
        return Math.min(prev + 200, filteredItems.length);
      });
      timeoutId = window.setTimeout(step, 50);
    };
    timeoutId = window.setTimeout(step, 50);
    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [filteredItems.length]);

  const findTxById = useCallback(
    (id: string) => items.find((tx) => tx.id === id) ?? null,
    [items]
  );

  const handleDelete = useCallback(async (id: string) => {
    const removed = findTxById(id);
    setItems((prev) => prev.filter((tx) => tx.id !== id));
    try {
      await deleteTransaction(id);
      if (removed) {
        onDeleted?.(removed);
      }
      setMetricsVersion((prev) => prev + 1);
    } catch {
      void loadFirstPage();
    }
  }, [findTxById, loadFirstPage, onDeleted]);

  const getExportLabel = () => {
    if (filter === "custom" && customStart && customEnd) {
      return `${customStart}_to_${customEnd}`;
    }
    if (filter === "today") return "today";
    if (filter === "last7") return "last_7_days";
    if (filter === "last30") return "last_30_days";
    if (filter === "month") return "this_month";
    if (filter === "lastMonth") return "last_month";
    return "custom";
  };

  const toCsvValue = (value: string | number | undefined | null) => {
    const raw = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(raw)) {
      return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
  };

  const formatExportDate = (value: number) => {
    const date = new Date(value);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const exportTransactions = async () => {
    if (isExporting) return;
    if (!range || !currentDeviceId) return;
    setIsExporting(true);
    try {
      // D: Use already-fetched rangeTransactions; fall back to fetch only while metrics is loading
      const transactions = isMetricsLoading
        ? await fetchTransactions({ range: { start: range.start, end: range.end } })
        : rangeTransactions;
      const headers = [
        "Date",
        "Amount",
        "Item",
        "Category",
        "PaymentMethod",
        "Id",
      ];
      const rows = transactions.map((tx) => [
        formatExportDate(tx.timestamp),
        tx.amount,
        tx.item,
        tx.category,
        tx.paymentMethod,
        tx.id,
      ]);
      const csv = [headers, ...rows]
        .map((row) => row.map(toCsvValue).join(","))
        .join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `export_${getExportLabel()}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      posthog.capture("expenses_exported", {
        transaction_count: transactions.length,
        filter_type: filter,
        date_range_label: getExportLabel(),
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Group transactions by date (stable ordering within the same day)
  // PERF-COMPUTE: Wrapped in useMemo to prevent re-computation on every render
  const groupedItems = useMemo(() => {
    const groups = new Map<
      number,
      { label: string; items: Transaction[]; total: number }
    >();
    visibleItems.forEach((tx) => {
      const dateObj = new Date(tx.timestamp);
      const dayKey = new Date(
        dateObj.getFullYear(),
        dateObj.getMonth(),
        dateObj.getDate()
      ).getTime();
      const label = dateObj.toLocaleDateString("en-IN", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
      const group = groups.get(dayKey) ?? { label, items: [], total: 0 };
      group.items.push(tx);
      group.total += tx.amount;
      groups.set(dayKey, group);
    });

    return Array.from(groups.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([dayKey, group]) => ({
        key: dayKey,
        label: group.label,
        total: group.total,
        items: group.items
          .slice()
          .sort((a, b) =>
            a.timestamp === b.timestamp
              ? b.id.localeCompare(a.id)
              : b.timestamp - a.timestamp
          ),
      }));
  }, [visibleItems]);

  // PERF-VIRTUAL: Flatten grouped items for virtualization (only when >50 items)
  const flattenedItems = useMemo(() => {
    const totalTxCount = groupedItems.reduce((sum, g) => sum + g.items.length, 0);
    if (totalTxCount <= 50) return null; // Don't virtualize small lists

    const flat: Array<
      | { type: "header"; key: number; label: string; total: number }
      | { type: "transaction"; key: string; tx: Transaction; index: number; groupKey: number }
    > = [];

    groupedItems.forEach((group) => {
      flat.push({ type: "header", key: group.key, label: group.label, total: group.total });
      group.items.forEach((tx, idx) => {
        flat.push({
          type: "transaction",
          key: tx.id || `${group.key}-${idx}`,
          tx,
          index: idx,
          groupKey: group.key,
        });
      });
    });

    return flat;
  }, [groupedItems]);

  // PERF-VIRTUAL: Virtualizer for large lists
  const virtualizer = useVirtualizer({
    count: flattenedItems?.length ?? 0,
    getScrollElement: () => virtualListRef.current,
    estimateSize: () => 72, // Approximate row height
    overscan: 5,
    enabled: flattenedItems !== null,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const hasPrevData = trendMetrics.prevCount > 0;
  const hasRangeData = trendMetrics.dailyCounts.some((count) => count > 0);
  const deltaLabel = `${trendMetrics.delta >= 0 ? "↑" : "↓"}${currencySymbol}${formatCurrency(
    Math.abs(trendMetrics.delta)
  )}`;
  const percentChange =
    trendMetrics.totalPrev !== 0
      ? (trendMetrics.delta / trendMetrics.totalPrev) * 100
      : null;
  const percentLabel =
    percentChange === null
      ? "—"
      : `${percentChange >= 0 ? "+" : "-"}${Math.abs(percentChange).toFixed(1)}%`;
  const chartReady = trendMetrics.series.length > 1;
  const hasPresetData = allocationMetrics.rangeCount > 0;
  const shouldShowTrends = hasPresetData;
  const shouldShowSummary = hasPresetData;
  const shouldShowMetrics = shouldShowTrends || shouldShowSummary;
  const dayLabels = useMemo(() => {
    if (!trendMetrics.series.length) return [];
    return trendMetrics.series.map((point) => {
      const date = new Date(point.x);
      return trendMetrics.bucket === "hour"
        ? date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
        : date.toLocaleDateString("en-IN", { month: "short", day: "2-digit" });
    });
  }, [trendMetrics.bucket, trendMetrics.series]);
  const weekStats = useMemo(() => {
    if (!trendMetrics.dailyTotals.length) {
      return { maxLabel: "—", maxValue: 0, minLabel: "—", minValue: 0 };
    }
    const totals = trendMetrics.dailyTotals;
    const maxValue = Math.max(...totals);
    const minValue = Math.min(...totals);
    const maxIndex = totals.indexOf(maxValue);
    const minIndex = totals.indexOf(minValue);
    return {
      maxLabel: dayLabels[maxIndex] ?? "—",
      maxValue,
      minLabel: dayLabels[minIndex] ?? "—",
      minValue,
    };
  }, [dayLabels, trendMetrics.dailyTotals]);

  const chartMeta = useMemo(() => {
    const series = trendMetrics.series;
    if (!series.length) {
      return null;
    }
    const values = series.map((point) => point.y);
    let min = Math.min(...values, trendMetrics.totalPrev, trendMetrics.totalBase);
    let max = Math.max(...values, trendMetrics.totalPrev, trendMetrics.totalBase);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      min = 0;
      max = 1;
    }
    if (max === min) {
      max += 1;
    }
    const pad = (max - min) * 0.1;
    const yMin = Math.max(0, min - pad);
    const yMax = max + pad;

    const CHART = {
      width: 320,
      height: 160,
      padding: { left: 46, right: 12, top: 12, bottom: 28 },
    };
    const innerWidth = CHART.width - CHART.padding.left - CHART.padding.right;
    const innerHeight = CHART.height - CHART.padding.top - CHART.padding.bottom;
    const lastIndex = series.length - 1;
    const xForIndex = (index: number) =>
      CHART.padding.left +
      (lastIndex === 0 ? 0 : (index / lastIndex) * innerWidth);
    const yForValue = (value: number) =>
      CHART.padding.top +
      (1 - (value - yMin) / (yMax - yMin)) * innerHeight;

    const points = series.map((point, index) => ({
      x: xForIndex(index),
      y: yForValue(point.y),
      value: point.y,
      ts: point.x,
    }));
    const linePath = points
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`
      )
      .join(" ");
    const yBottom = CHART.padding.top + innerHeight;
    const areaPath = [
      `M ${points[0].x} ${points[0].y}`,
      ...points.slice(1).map((point) => `L ${point.x} ${point.y}`),
      `L ${points[points.length - 1].x} ${yBottom}`,
      `L ${points[0].x} ${yBottom}`,
      "Z",
    ].join(" ");

    const yTicks = [yMax, (yMax + yMin) / 2, yMin];
    const xTickIdx = [
      0,
      Math.floor(lastIndex / 2),
      lastIndex,
    ].filter((value, index, arr) => arr.indexOf(value) === index);

    return {
      CHART,
      points,
      linePath,
      areaPath,
      yTicks,
      xTickIdx,
      baseLineY: yForValue(trendMetrics.totalBase),
      prevLineY: yForValue(trendMetrics.totalPrev),
      yMin,
      yMax,
    };
  }, [trendMetrics.series, trendMetrics.totalBase, trendMetrics.totalPrev]);

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
      void loadFirstPage();
    },
    [findTxById, loadFirstPage]
  );

  const mobileSheetTx = mobileSheetTxId ? findTxById(mobileSheetTxId) : null;

  const donutSegments: DonutSegment[] = useMemo(() => {
    if (allocationMetrics.totalRange <= 0) return [];
    if (allocationMetrics.topCategories.length < 1) return [];
    const colors = [
      "var(--kk-ember)",
      "var(--kk-saffron)",
      "var(--kk-ember-deep)",
    ];
    let offset = 25;
    return allocationMetrics.topCategories.map((category, index) => {
      const share = (category.total / allocationMetrics.totalRange) * 100;
      const segment = {
        color: colors[index % colors.length],
        dashArray: `${share} ${100 - share}`,
        offset,
      };
      offset -= share;
      return segment;
    });
  }, [allocationMetrics]);

  const topCategoryBreakdown = allocationMetrics.topCategories
    .map((category) => {
      const share = allocationMetrics.totalRange
        ? Math.round((category.total / allocationMetrics.totalRange) * 100)
        : 0;
      if (allocationMode === "count") {
        return `${category.label} ${category.total} (${share}%)`;
      }
      return `${category.label} ${currencySymbol}${formatCurrency(category.total)} (${share}%)`;
    })
    .join(" · ");

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{
            type: "spring",
            damping: 30,
            stiffness: 300,
          }}
          className="fixed inset-0 z-50 bg-[var(--kk-paper)]"
        >
          <div className="mx-auto h-full w-full max-w-4xl">
            <div
              ref={listRef}
              className="flex h-full min-h-0 flex-col overflow-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
            >
              {/* Header */}
              <header className="z-20 shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/90 px-5 py-4 backdrop-blur-md transform-gpu">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="kk-icon-btn kk-icon-btn-lg"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div>
                      <div className="text-2xl font-semibold font-[family:var(--font-display)]">
                        Expenses
                      </div>
                    </div>
                  </div>
                </div>

                <HistoryFilters
                  query={query}
                  onQueryChange={setQuery}
                  filter={filter}
                  onFilterChange={setFilter}
                  customStart={customStart}
                  customEnd={customEnd}
                  onCustomStartChange={setCustomStart}
                  onCustomEndChange={setCustomEnd}
                  onDebouncedStartChange={setDebouncedCustomStart}
                  onDebouncedEndChange={setDebouncedCustomEnd}
                  isExporting={isExporting}
                  isExportDisabled={range === null}
                  onExport={exportTransactions}
                  onImport={() => setIsImportOpen(true)}
                />

                {/* Owner filter — only shown when partner data exists */}
                {items.some((tx) => tx.owner_device_id !== currentDeviceId) && (
                  <div className="mt-3 flex gap-1">
                    {(["all", "me", "partner"] as const).map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setOwnerFilter(opt)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition-all ${ownerFilter === opt
                          ? "bg-[var(--kk-ember)] text-white"
                          : "bg-[var(--kk-paper)] text-[var(--kk-ash)] hover:text-[var(--kk-ink)]"
                          }`}
                      >
                        {opt === "me" && <Fingerprint className="h-3 w-3" />}
                        {opt === "partner" && <Handshake className="h-3 w-3" />}
                        {opt === "all" ? "All" : opt === "me" ? "Me" : "Partner"}
                      </button>
                    ))}
                  </div>
                )}

                <MetricsDashboard
                  shouldShowMetrics={shouldShowMetrics}
                  shouldShowTrends={shouldShowTrends}
                  shouldShowSummary={shouldShowSummary}
                  isMetricsLoading={isMetricsLoading}
                  trendMetrics={trendMetrics}
                  trendRangeLabels={trendRangeLabels}
                  chartMeta={chartMeta}
                  chartReady={chartReady}
                  dayLabels={dayLabels}
                  hasPrevData={hasPrevData}
                  deltaLabel={deltaLabel}
                  percentLabel={percentLabel}
                  allocationMode={allocationMode}
                  onAllocationModeChange={setAllocationMode}
                  allocationMetrics={allocationMetrics}
                  donutSegments={donutSegments}
                  formatCurrency={formatCurrency}
                  currencySymbol={currencySymbol}
                />
              </header>

              {/* Transaction List */}
              <div className="px-5 pb-8 pt-4">
                {filteredItems.length === 0 && !isLoading ? (
                  <div className="flex h-64 flex-col items-center justify-center text-center">
                    <div className="flex h-16 w-16 items-center justify-center kk-radius-md bg-[var(--kk-smoke)]">
                      <Search className="h-8 w-8 text-[var(--kk-ash)]" />
                    </div>
                    <div className="mt-4 text-lg font-medium text-[var(--kk-ink)]">No expenses found</div>
                    <div className="mt-1 text-sm text-[var(--kk-ash)]">Try adjusting your search or filters</div>
                  </div>
                ) : flattenedItems ? (
                  // PERF-VIRTUAL: Virtualized list for large datasets (>50 items)
                  <div ref={virtualListRef} className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                    {virtualItems.map((virtualItem) => {
                      const item = flattenedItems[virtualItem.index];
                      if (!item) return null;

                      if (item.type === "header") {
                        return (
                          <div
                            key={item.key}
                            className="sticky top-0 z-10 mb-3 flex items-center gap-2 bg-[var(--kk-paper)]"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              transform: `translateY(${virtualItem.start}px)`,
                              height: `${virtualItem.size}px`,
                            }}
                          >
                            <div className="kk-label text-[var(--kk-ember)]">{item.label}</div>
                            <div className="flex-1 border-t border-[var(--kk-smoke)]" />
                            <div className="kk-meta font-medium">
                              <span className="kk-currency">{currencySymbol}</span>
                              {formatCurrency(item.total)}
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={item.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                            height: `${virtualItem.size}px`,
                          }}
                        >
                          <TransactionRow
                            tx={item.tx}
                            index={item.index}
                            metaVariant="time"
                            ownerLabel={currentDeviceId ? (item.tx.owner_device_id === currentDeviceId ? "Me" : (partnerName ?? "Partner")) : undefined}
                            hasEdit={hasEdit && item.tx.owner_device_id === currentDeviceId}
                            onEdit={hasEdit && item.tx.owner_device_id === currentDeviceId ? handleEdit : undefined}
                            onDelete={item.tx.owner_device_id === currentDeviceId ? handleDelete : undefined}
                            onOpenMobileSheet={item.tx.owner_device_id === currentDeviceId ? openMobileSheet : undefined}
                            formatCurrency={formatCurrency}
                            currencySymbol={currencySymbol}
                            amountMaxWidthClass="max-w-[24vw]"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  // Standard list for small datasets (<=50 items)
                  <div className="space-y-6">
                    {groupedItems.map((group) => (
                      <div key={group.key}>
                        {/* Date Header */}
                        <div className="sticky top-0 z-10 mb-3 flex items-center gap-2">
                          <div className="kk-label text-[var(--kk-ember)]">
                            {group.label}
                          </div>
                          <div className="flex-1 border-t border-[var(--kk-smoke)]" />
                          <div className="kk-meta font-medium">
                            <span className="kk-currency">{currencySymbol}</span>{formatCurrency(group.total)}
                          </div>
                        </div>

                        {/* Transactions for this date */}
                        <div className="space-y-2">
                          {group.items.map((tx, index) => {
                            const rowKey = tx.id || `${group.key}-${index}`;
                            return (
                              <TransactionRow
                                key={rowKey}
                                tx={tx}
                                index={index}
                                metaVariant="time"
                                ownerLabel={currentDeviceId ? (tx.owner_device_id === currentDeviceId ? "Me" : (partnerName ?? "Partner")) : undefined}
                                hasEdit={hasEdit && tx.owner_device_id === currentDeviceId}
                                onEdit={hasEdit && tx.owner_device_id === currentDeviceId ? handleEdit : undefined}
                                onDelete={tx.owner_device_id === currentDeviceId ? handleDelete : undefined}
                                onOpenMobileSheet={tx.owner_device_id === currentDeviceId ? openMobileSheet : undefined}
                                formatCurrency={formatCurrency}
                                currencySymbol={currencySymbol}
                                amountMaxWidthClass="max-w-[24vw]"
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Load More */}
                {hasMore && filteredItems.length > 0 && (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={isLoading}
                      className="kk-btn-secondary"
                    >
                      {isLoading ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div >

          <TransactionActionSheet
            isOpen={isMobileSheetOpen}
            tx={mobileSheetTx}
            hasEdit={hasEdit && (!currentDeviceId || mobileSheetTx?.owner_device_id === currentDeviceId)}
            confirmDelete={mobileConfirmDelete}
            setConfirmDelete={setMobileConfirmDelete}
            onClose={closeMobileSheet}
            onEdit={hasEdit && (!currentDeviceId || mobileSheetTx?.owner_device_id === currentDeviceId) ? handleEdit : undefined}
            onDelete={!currentDeviceId || mobileSheetTx?.owner_device_id === currentDeviceId ? handleDelete : undefined}
            onTogglePrivate={handleTogglePrivate}
            isShared={isMobileSheetShared}
            formatCurrency={formatCurrency}
            currencySymbol={currencySymbol}
          />
          {isImportOpen && (
            <ImportModal
              isOpen={isImportOpen}
              onClose={() => setIsImportOpen(false)}
              onImported={() => {
                setMetricsVersion((v) => v + 1);
                loadFirstPage();
              }}
            />
          )}
        </motion.div >
      )}
    </AnimatePresence >
  );
});

AnalyticsView.displayName = "AnalyticsView";
