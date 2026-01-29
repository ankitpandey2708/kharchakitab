"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  ChevronLeft,
  Calendar,
  ArrowRight,
  Download,
} from "lucide-react";
import {
  deleteTransaction,
  getTransactionsInRange,
} from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { EmptyState } from "@/src/components/EmptyState";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";
import { TransactionRow } from "@/src/components/TransactionRow";
import { TransactionActionSheet } from "@/src/components/TransactionActionSheet";
import { formatCurrency as formatCurrencyUtil } from "@/src/utils/money";
import { useMobileSheet } from "@/src/hooks/useMobileSheet";
import { useSummaryViewSync } from "@/src/hooks/useSummaryViewSync";
import posthog from "posthog-js";

const HISTORY_PAGE_SIZE = 30;

type SummaryView = "today" | "week" | "month";

interface HistoryViewProps {
  isOpen: boolean;
  onClose: () => void;
  onDeleted?: (tx: Transaction) => void;
  onEdit?: (tx: Transaction) => void;
  editedTx?: Transaction | null;
  refreshKey?: number;
}

const mapFilterToSummaryView = (value: FilterKey): SummaryView =>
  value === "custom" ? "month" : value;

type ChartMeta = {
  CHART: {
    width: number;
    height: number;
    padding: { left: number; right: number; top: number; bottom: number };
  };
  points: { x: number; y: number; value: number; ts: number }[];
  linePath: string;
  areaPath: string;
  yTicks: number[];
  xTickIdx: number[];
  baseLineY: number;
  prevLineY: number;
  yMin: number;
  yMax: number;
};

interface TrendChartProps {
  chartMeta: ChartMeta | null;
  chartReady: boolean;
  isMetricsLoading: boolean;
  dayLabels: string[];
  bucket: "hour" | "day";
  totalBase: number;
  totalPrev: number;
  formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const TrendChart = React.memo(
  ({
    chartMeta,
    chartReady,
    isMetricsLoading,
    dayLabels,
    bucket,
    totalBase,
    totalPrev,
    formatCurrency,
  }: TrendChartProps) => {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const chartRef = useRef<HTMLDivElement | null>(null);

    const labelPositions = useMemo(() => {
      if (!chartMeta) return null;
      const baseLabelY = chartMeta.baseLineY - 6;
      const prevLabelY = chartMeta.prevLineY - 6;
      let baseY = baseLabelY;
      let prevY = prevLabelY;
      if (totalPrev > 0 && Math.abs(baseLabelY - prevLabelY) < 12) {
        if (baseLabelY <= prevLabelY) {
          baseY = baseLabelY - 12;
          prevY = prevLabelY + 12;
        } else {
          baseY = baseLabelY + 12;
          prevY = prevLabelY - 12;
        }
      }
      const minY = chartMeta.CHART.padding.top + 10;
      const maxY = chartMeta.CHART.height - 6;
      const clamp = (value: number) => Math.min(Math.max(value, minY), maxY);
      return {
        baseY: clamp(baseY),
        prevY: clamp(prevY),
      };
    }, [chartMeta, totalPrev]);

    useEffect(() => {
      setHoverIndex(null);
    }, [chartMeta?.points.length]);

    const updateHover = useCallback(
      (clientX: number) => {
        if (!chartMeta || !chartRef.current) return;
        const rect = chartRef.current.getBoundingClientRect();
        if (!rect.width) return;
        const scale = rect.width / chartMeta.CHART.width;
        const left = chartMeta.CHART.padding.left * scale;
        const right = chartMeta.CHART.padding.right * scale;
        const inner = rect.width - left - right;
        if (inner <= 0) return;
        const x = Math.min(Math.max(clientX - rect.left - left, 0), inner);
        const pct = x / inner;
        const idx = Math.round(pct * (chartMeta.points.length - 1));
        setHoverIndex((prev) => (prev === idx ? prev : idx));
      },
      [chartMeta]
    );

    if (isMetricsLoading) {
      return <div className="kk-skeleton h-36 w-full" />;
    }

    if (!chartReady || !chartMeta) {
      return (
        <div className="flex h-24 w-full max-w-[260px] items-center justify-center kk-radius-sm border border-[var(--kk-smoke-heavy)] kk-micro text-[var(--kk-ash)]">
          —
        </div>
      );
    }

    return (
      <div
        ref={chartRef}
        className="relative w-full"
        onMouseMove={(event) => updateHover(event.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchMove={(event) => {
          if (event.touches[0]) {
            updateHover(event.touches[0].clientX);
          }
        }}
        onTouchEnd={() => setHoverIndex(null)}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${chartMeta.CHART.width} ${chartMeta.CHART.height}`}
          className="h-40 w-full"
        >
          {chartMeta.yTicks.map((tick) => {
            const y =
              chartMeta.CHART.padding.top +
              (1 - (tick - chartMeta.yMin) / (chartMeta.yMax - chartMeta.yMin)) *
              (chartMeta.CHART.height -
                chartMeta.CHART.padding.top -
                chartMeta.CHART.padding.bottom);
            return (
              <g key={`grid-${tick}`}>
                <text
                  x={chartMeta.CHART.padding.left - 6}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[var(--kk-ash)] text-[9px]"
                >
                  ₹{formatCurrency(tick)}
                </text>
              </g>
            );
          })}
          {totalPrev > 0 && (
            <line
              x1={chartMeta.CHART.padding.left}
              x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
              y1={chartMeta.prevLineY}
              y2={chartMeta.prevLineY}
              stroke="var(--kk-ash)"
              strokeDasharray="2 6"
            />
          )}
          <line
            x1={chartMeta.CHART.padding.left}
            x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
            y1={chartMeta.baseLineY}
            y2={chartMeta.baseLineY}
            stroke="var(--kk-ember)"
            strokeDasharray="6 6"
            strokeLinecap="round"
            strokeWidth={totalPrev > 0 ? 1 : 1.5}
            opacity={totalPrev > 0 ? 0.55 : 0.85}
          />
          <text
            x={chartMeta.CHART.width - chartMeta.CHART.padding.right}
            y={labelPositions?.baseY ?? chartMeta.baseLineY - 6}
            textAnchor="end"
            className="fill-[var(--kk-ember)] text-[9px] font-medium"
            style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}
          >
            Total ₹{formatCurrency(totalBase)}
          </text>
          {totalPrev > 0 && (
            <text
              x={chartMeta.CHART.width - chartMeta.CHART.padding.right}
              y={labelPositions?.prevY ?? chartMeta.prevLineY - 6}
              textAnchor="end"
              className="fill-[var(--kk-ash)] text-[9px] font-medium"
              style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 3 }}
            >
              Total ₹{formatCurrency(totalPrev)}
            </text>
          )}
          <path
            d={chartMeta.linePath}
            fill="none"
            stroke="var(--kk-ember)"
            strokeWidth="2"
          />
          {hoverIndex !== null && chartMeta.points[hoverIndex] && (
            <g>
              <line
                x1={chartMeta.points[hoverIndex].x}
                x2={chartMeta.points[hoverIndex].x}
                y1={chartMeta.CHART.padding.top}
                y2={
                  chartMeta.CHART.height - chartMeta.CHART.padding.bottom
                }
                stroke="var(--kk-ash)"
                strokeDasharray="2 4"
              />
              <circle
                cx={chartMeta.points[hoverIndex].x}
                cy={chartMeta.points[hoverIndex].y}
                r="3"
                fill="var(--kk-ember)"
                stroke="white"
                strokeWidth="1.5"
              />
            </g>
          )}
          {chartMeta.xTickIdx.map((idx) => (
            <text
              key={`xlabel-${idx}`}
              x={chartMeta.points[idx]?.x ?? 0}
              y={chartMeta.CHART.height - 6}
              textAnchor="middle"
              className="kk-micro fill-[var(--kk-ash)]"
            >
              {dayLabels[idx] ?? ""}
            </text>
          ))}
        </svg>
        {hoverIndex !== null && chartMeta.points[hoverIndex] && (
          <div
            className="pointer-events-none absolute top-2 kk-radius-sm border border-[var(--kk-smoke-heavy)] bg-white/95 px-2 py-1 kk-micro text-[var(--kk-ash)] shadow-[var(--kk-shadow-sm)]"
            style={{
              left: `${(chartMeta.points[hoverIndex].x / chartMeta.CHART.width) * 100
                }%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="kk-micro font-semibold text-[var(--kk-ink)]">
              ₹{formatCurrency(chartMeta.points[hoverIndex].value)}
            </div>
            <div>
              {bucket === "hour"
                ? new Date(chartMeta.points[hoverIndex].ts).toLocaleTimeString(
                  "en-IN",
                  { hour: "2-digit", minute: "2-digit" }
                )
                : new Date(chartMeta.points[hoverIndex].ts).toLocaleDateString(
                  "en-IN",
                  { day: "numeric", month: "short" }
                )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

export const HistoryView = ({
  isOpen,
  onClose,
  onDeleted,
  onEdit,
  editedTx,
  refreshKey,
}: HistoryViewProps) => {
  const [filter, setFilter] = useState<FilterKey>("month");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const customStartRef = useRef<HTMLInputElement | null>(null);
  const customEndRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listRequestRef = useRef(0);
  const skipSummarySyncRef = useRef(false);
  const { syncSummaryView } = useSummaryViewSync<SummaryView>({
    enabled: isOpen,
    listen: false,
    parse: (value) =>
      value === "today" || value === "week" || value === "month"
        ? value
        : null,
    onReceive: (value) => {
      setFilter((prev) => {
        if (prev === value) return prev;
        skipSummarySyncRef.current = true;
        return value;
      });
    },
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isMetricsLoading, setIsMetricsLoading] = useState(false);
  const [metricsVersion, setMetricsVersion] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [renderLimit, setRenderLimit] = useState(200);
  const {
    isOpen: isMobileSheetOpen,
    activeId: mobileSheetTxId,
    confirmDelete: mobileConfirmDelete,
    setConfirmDelete: setMobileConfirmDelete,
    openSheet: openMobileSheet,
    closeSheet: closeMobileSheet,
  } = useMobileSheet();
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

  const triggerPicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const node = ref.current;
    if (!node) return;
    const picker = (node as HTMLInputElement & { showPicker?: () => void })
      .showPicker;
    if (typeof picker === "function") {
      picker.call(node);
    } else {
      node.focus();
      node.click();
    }
  };

  const range = useMemo(
    () => getRangeForFilter(filter, { customStart, customEnd }),
    [filter, customStart, customEnd]
  );

  const changeRange = useMemo(() => {
    if (filter === "custom") return range;
    return getRangeForFilter(filter);
  }, [filter, range]);

  useEffect(() => {
    if (filter === "custom") return;
    const nextRange = getRangeForFilter(filter);
    if (!nextRange) return;
    setCustomStart(toDateInputValue(nextRange.start));
    setCustomEnd(toDateInputValue(nextRange.end));
  }, [filter]);

  const fetchPage = useCallback(
    (cursorValue?: number) =>
      range
        ? getTransactionsInRange(
          range.start,
          range.end,
          HISTORY_PAGE_SIZE,
          cursorValue
        )
        : Promise.resolve([] as Transaction[]),
    [range]
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
    if (filter === "week") return;
    syncSummaryView(mapFilterToSummaryView(filter));
  }, [filter, isOpen, syncSummaryView]);

  useEffect(() => {
    if (!isOpen) return;
    void loadFirstPage();
  }, [isOpen, loadFirstPage, refreshKey]);

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


  const formatCurrency = useCallback(
    (value: number, options: Intl.NumberFormatOptions = {}) =>
      formatCurrencyUtil(value, options),
    []
  );

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
          ? { month: "short", day: "numeric", year: "numeric" }
          : { month: "short", day: "numeric" }
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
        metricsVersion,
      ].join("|");
      const cached = metricsCacheRef.current.get(cacheKey);
      if (cached) {
        setRangeTransactions(cached.rangeTransactions);
        setTrendMetrics(cached.trendMetrics);
        setTrendRangeLabels(cached.trendRangeLabels);
        setIsMetricsLoading(false);
        return;
      }
      setIsMetricsLoading(true);
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
          ? getTransactionsInRange(base.start, base.end)
          : Promise.resolve([] as Transaction[]);
        const prevTransactionsPromise = prevRange
          ? getTransactionsInRange(prevRange.start, prevRange.end)
          : Promise.resolve([] as Transaction[]);
        const rangeMatchesBase =
          !!base &&
          !!range &&
          base.start === range.start &&
          base.end === range.end;
        const rangeTransactionsPromise =
          range && !rangeMatchesBase
            ? getTransactionsInRange(range.start, range.end)
            : Promise.resolve([] as Transaction[]);

        const [baseTransactions, prevTransactions, rangeTransactions] =
          await Promise.all([
            baseTransactionsPromise,
            prevTransactionsPromise,
            rangeTransactionsPromise,
          ]);
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
        baseTransactions.forEach((tx) => {
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

        const totalBase = baseTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0
        );
        const totalPrev = prevTransactions.reduce(
          (sum, tx) => sum + tx.amount,
          0
        );
        const baseCount = baseTransactions.length;
        const prevCount = prevTransactions.length;
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
        setRangeTransactions(resolvedRangeTransactions);
        setTrendMetrics({
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
        });
        setTrendRangeLabels({ current: currentLabel, previous: previousLabel });
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
        if (active) setIsMetricsLoading(false);
      }
    };
    void loadMetrics();
    return () => {
      active = false;
    };
  }, [
    changeRange,
    filter,
    formatRangeLabel,
    isOpen,
    metricsVersion,
    range,
    refreshKey,
  ]);

  useEffect(() => {
    if (!isOpen) return;
    const categoryTotals = new Map<string, number>();
    const categoryCounts = new Map<string, number>();
    rangeTransactions.forEach((tx) => {
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
        ? rangeTransactions.reduce((sum, tx) => sum + tx.amount, 0)
        : rangeTransactions.length;
    const rangeCount = rangeTransactions.length;
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
  }, [allocationMode, isOpen, rangeTransactions]);

  useEscapeKey(isOpen && !isMobileSheetOpen, onClose);

  const searchableItems = useMemo(
    () =>
      items.map((tx) => ({
        tx,
        search: `${tx.item} ${tx.category} ${tx.amount}`.toLowerCase(),
      })),
    [items]
  );

  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) return items;
    const q = debouncedQuery.toLowerCase();
    return searchableItems
      .filter((entry) => entry.search.includes(q))
      .map((entry) => entry.tx);
  }, [debouncedQuery, items, searchableItems]);

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
    if (filter === "week") return "this_week";
    if (filter === "month") return "this_month";
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
    if (!range) return;
    setIsExporting(true);
    try {
      const transactions = await getTransactionsInRange(
        range.start,
        range.end
      );

      const headers = [
        "Date",
        "Amount",
        "Item",
        "Category",
        "PaymentMethod",
      ];
      const rows = transactions.map((tx) => [
        formatExportDate(tx.timestamp),
        tx.amount,
        tx.item,
        tx.category,
        tx.paymentMethod,
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
        day: "numeric",
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

  const hasPrevData = trendMetrics.prevCount > 0;
  const hasRangeData = trendMetrics.dailyCounts.some((count) => count > 0);
  const deltaLabel = `${trendMetrics.delta >= 0 ? "↑" : "↓"}₹${formatCurrency(
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
        : date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
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

  const mobileSheetTx = mobileSheetTxId ? findTxById(mobileSheetTxId) : null;

  const donutSegments = useMemo(() => {
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
      return `${category.label} ₹${formatCurrency(category.total)} (${share}%)`;
    })
    .join(" · ");

  return (
    <AnimatePresence>
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
              <header className="z-20 shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/90 px-5 py-4 backdrop-blur-md">
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

                {/* Search and Filters */}
                <div className="kk-radius-md kk-shadow-sm mt-4 border border-[var(--kk-smoke)] bg-[var(--kk-cream)]/70 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="relative flex-1">
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search expenses..."
                        className="kk-input pl-4 text-sm shadow-[var(--kk-shadow-md)] sm:pl-10"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={exportTransactions}
                      disabled={isExporting || range === null}
                      className="kk-btn-secondary kk-btn-compact order-3 w-full lg:order-none lg:w-auto"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </button>
                  </div>
                  <div className="mt-3 flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {[
                      { key: "today", label: "Today" },
                      { key: "week", label: "This week" },
                      { key: "month", label: "This Month" },
                      { key: "custom", label: "Custom" },
                    ].map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => {
                          const next = option.key as FilterKey;
                          setFilter(next);
                        }}
                        className={`kk-chip kk-chip-filter whitespace-nowrap transition ${filter === option.key ? "kk-chip-active" : "kk-chip-muted"
                          }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {(
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-left text-[var(--kk-ash)] opacity-80 transition">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--kk-smoke)] bg-white/60 px-4 py-2.5 transition-all focus-within:border-[var(--kk-smoke-heavy)] sm:rounded-full sm:px-3 sm:py-1">
                        <label className="kk-label flex items-center gap-2">
                          <span className="opacity-70 sm:opacity-100">From</span>
                          <span className="flex items-center gap-0.5">
                            <input
                              type="date"
                              value={customStart}
                              ref={customStartRef}
                              inputMode="none"
                              aria-readonly="true"
                              onMouseDown={(event) => {
                                event.preventDefault();
                              }}
                              onClick={() => {
                                if (filter !== "custom") setFilter("custom");
                                window.setTimeout(() => {
                                  triggerPicker(customStartRef);
                                }, 0);
                              }}
                              onKeyDown={(event) => {
                                event.preventDefault();
                              }}
                              onBeforeInput={(event) => {
                                event.preventDefault();
                              }}
                              onPaste={(event) => {
                                event.preventDefault();
                              }}
                              onChange={(event) => {
                                if (filter !== "custom") setFilter("custom");
                                setCustomStart(event.target.value);
                              }}
                              className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                              type="button"
                              aria-label="Open start date picker"
                              onClick={() => {
                                if (filter !== "custom") {
                                  setFilter("custom");
                                  window.setTimeout(() => {
                                    triggerPicker(customStartRef);
                                  }, 0);
                                } else {
                                  triggerPicker(customStartRef);
                                }
                              }}
                              className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kk-ember)]/40 disabled:pointer-events-none"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </label>
                        <ArrowRight className="hidden h-3 w-3 text-[var(--kk-ash)] sm:block" />
                        <label className="kk-label flex items-center gap-2">
                          <span className="opacity-70 sm:opacity-100">To</span>
                          <span className="flex items-center gap-0.5">
                            <input
                              type="date"
                              value={customEnd}
                              min={customStart || undefined}
                              ref={customEndRef}
                              inputMode="none"
                              aria-readonly="true"
                              onMouseDown={(event) => {
                                event.preventDefault();
                              }}
                              onClick={() => {
                                if (filter !== "custom") setFilter("custom");
                                window.setTimeout(() => {
                                  triggerPicker(customEndRef);
                                }, 0);
                              }}
                              onKeyDown={(event) => {
                                event.preventDefault();
                              }}
                              onBeforeInput={(event) => {
                                event.preventDefault();
                              }}
                              onPaste={(event) => {
                                event.preventDefault();
                              }}
                              onChange={(event) => {
                                if (filter !== "custom") setFilter("custom");
                                setCustomEnd(event.target.value);
                              }}
                              className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                              type="button"
                              aria-label="Open end date picker"
                              onClick={() => {
                                if (filter !== "custom") {
                                  setFilter("custom");
                                  window.setTimeout(() => {
                                    triggerPicker(customEndRef);
                                  }, 0);
                                } else {
                                  triggerPicker(customEndRef);
                                }
                              }}
                              className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kk-ember)]/40 disabled:pointer-events-none"
                            >
                              <Calendar className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>

                {shouldShowMetrics && (
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {shouldShowTrends && (
                      <div className="kk-surface kk-shadow-sm p-4">
                        <div className="flex flex-col gap-3">
                          <div>
                            <div className="kk-label">
                              Trends
                            </div>
                            <div className="mt-1 space-y-0.5 text-[12px] text-[var(--kk-ash)]">
                              {isMetricsLoading ? (
                                <div className="kk-skeleton h-4 w-40" />
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-[var(--kk-ember)]" />
                                    This period:{" "}
                                    <span className="text-[var(--kk-ink)]">
                                      {trendRangeLabels.current || "—"}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="h-2 w-2 rounded-full bg-[var(--kk-ash)]" />
                                    Previous period:{" "}
                                    <span className="text-[var(--kk-ink)]">
                                      {trendRangeLabels.previous || "—"}
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                            <div className="mt-2 text-sm font-medium text-[var(--kk-ash)]">
                              {isMetricsLoading ? (
                                <div className="kk-skeleton h-5 w-24" />
                              ) : hasPrevData ? (
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide font-[family:var(--font-mono)] ${trendMetrics.delta >= 0
                                    ? "text-[var(--kk-ember-deep)]/70"
                                    : "text-[var(--kk-ash)]"
                                    }`}
                                >
                                  {deltaLabel} ({percentLabel})
                                </span>
                              ) : (
                                <span className="text-[var(--kk-ash)]">
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="group relative mt-2 flex min-h-[160px] w-full items-center justify-start">
                            <TrendChart
                              chartMeta={chartMeta}
                              chartReady={chartReady}
                              isMetricsLoading={isMetricsLoading}
                              dayLabels={dayLabels}
                              bucket={trendMetrics.bucket}
                              totalBase={trendMetrics.totalBase}
                              totalPrev={trendMetrics.totalPrev}
                              formatCurrency={formatCurrency}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {shouldShowSummary && (
                      <div className="kk-surface kk-shadow-sm p-4">
                        <div className="kk-label">
                          Summary
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setAllocationMode("amount")}
                            className={`kk-chip kk-chip-filter transition ${allocationMode === "amount"
                              ? "kk-chip-active"
                              : "kk-chip-muted"
                              }`}
                          >
                            Amount
                          </button>
                          <button
                            type="button"
                            onClick={() => setAllocationMode("count")}
                            className={`kk-chip kk-chip-filter transition ${allocationMode === "count"
                              ? "kk-chip-active"
                              : "kk-chip-muted"
                              }`}
                          >
                            Count
                          </button>
                        </div>
                        <div className="mt-4 flex min-h-[160px] flex-col items-center justify-center gap-5">
                          {donutSegments.length >= 1 ? (
                            <svg
                              aria-hidden
                              viewBox="0 0 42 42"
                              className="h-28 w-28"
                            >
                              <circle
                                cx="21"
                                cy="21"
                                r="16"
                                fill="none"
                                stroke="var(--kk-smoke-heavy)"
                                strokeWidth="6"
                              />
                              {donutSegments.map((segment, index) => (
                                <circle
                                  key={`${segment.color}-${index}`}
                                  cx="21"
                                  cy="21"
                                  r="16"
                                  fill="none"
                                  stroke={segment.color}
                                  strokeWidth="6"
                                  strokeDasharray={segment.dashArray}
                                  strokeDashoffset={segment.offset}
                                  pathLength={100}
                                  strokeLinecap="round"
                                />
                              ))}
                            </svg>
                          ) : (
                            <div className="flex h-28 w-28 items-center justify-center rounded-full border border-[var(--kk-smoke-heavy)] kk-micro text-[var(--kk-ash)]">
                              —
                            </div>
                          )}
                          <div
                            className={`grid gap-x-6 gap-y-2 text-[13px] text-[var(--kk-ash)] ${allocationMetrics.topCategories.length <= 1 ? "justify-items-center text-center" : "grid-cols-1 sm:grid-cols-2"}`}
                          >
                            {allocationMetrics.topCategories.length === 0 ? (
                              <span>—</span>
                            ) : (
                              allocationMetrics.topCategories.map((category, index) => {
                                const share = allocationMetrics.totalRange
                                  ? Math.round(
                                    (category.total / allocationMetrics.totalRange) * 100
                                  )
                                  : 0;
                                const absoluteValue =
                                  allocationMode === "count"
                                    ? String(category.total)
                                    : `₹${formatCurrency(category.total)}`;
                                return (
                                  <div key={category.label} className="flex items-center gap-3">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full"
                                      style={{ background: donutSegments[index]?.color }}
                                    />
                                    <span className="text-[var(--kk-ink)]">
                                      {category.label}
                                    </span>
                                    <span className="text-[var(--kk-ash)]">
                                      {absoluteValue} ({share}%)
                                    </span>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </header>

              {/* Transaction List */}
              <div className="px-5 pb-8 pt-4">
                {filteredItems.length === 0 && !isLoading ? (
                  <EmptyState
                    icon={<Search className="h-8 w-8 text-[var(--kk-ash)]" />}
                    title="No expenses found"
                    subtitle="Try adjusting your search or filters"
                    className="h-64"
                  />
                ) : (
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
                            ₹{formatCurrency(group.total)}
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
                                hasEdit={hasEdit}
                                onEdit={hasEdit ? handleEdit : undefined}
                                onDelete={handleDelete}
                                onOpenMobileSheet={openMobileSheet}
                                formatCurrency={formatCurrency}
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
          </div>

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
        </motion.div>
      )}
    </AnimatePresence>
  );
};
