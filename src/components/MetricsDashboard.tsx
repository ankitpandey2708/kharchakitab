// PERF-RERENDER: Wrapped in React.memo with useMemo for chart calculations to prevent expensive re-computations on every render
// PERF-HANDLER: Added requestAnimationFrame throttling for onMouseMove and onTouchMove event handlers

"use client";

import React, { memo, useMemo, useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ========================
// SHARED TYPES
// ========================

interface ChartMeta {
    CHART: {
        width: number;
        height: number;
        padding: { left: number; right: number; top: number; bottom: number };
    };
    points: { x: number; y: number; value: number; ts: number }[];
    linePath: string;
    yTicks: number[];
    xTickIdx: number[];
    baseLineY: number;
    prevLineY: number;
    avgLineY: number;
    yMin: number;
    yMax: number;
    barWidth: number;
}

const CATEGORY_COLORS = [
    "var(--kk-ember)",
    "var(--kk-ocean)",
    "var(--kk-sage)",
    "var(--kk-saffron)",
    "var(--kk-ember-deep)",
    "var(--kk-ash)",
];

// ========================
// TREND CHART COMPONENT
// ========================

interface TrendChartProps {
    chartMeta: ChartMeta | null;
    chartReady: boolean;
    isMetricsLoading: boolean;
    dayLabels: string[];
    bucket: "hour" | "day";
    useBarChart: boolean;
    totalBase: number;
    totalPrev: number;
    dailyAvg: number;
    formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
    currencySymbol: string;
}

const TrendChart = memo(
    ({
        chartMeta,
        chartReady,
        isMetricsLoading,
        dayLabels,
        bucket,
        useBarChart,
        totalBase,
        totalPrev,
        dailyAvg,
        formatCurrency,
        currencySymbol,
    }: TrendChartProps) => {
        const [activeIndex, setActiveIndex] = useState<number | null>(null);
        const chartRef = useRef<HTMLDivElement | null>(null);
        // PERF-HANDLER: RAF throttling for mouse/touch events to prevent UI lag
        const rafId = useRef<number | null>(null);

        useEffect(() => {
            return () => {
                if (rafId.current) {
                    cancelAnimationFrame(rafId.current);
                }
            };
        }, []);

        const labelPositions = useMemo(() => {
            if (!chartMeta) return null;

            const labels: { key: string; y: number; priority: number }[] = [];
            labels.push({ key: "total", y: chartMeta.baseLineY - 6, priority: 1 });
            if (totalPrev > 0) {
                labels.push({ key: "prev", y: chartMeta.prevLineY - 6, priority: 2 });
            }
            if (dailyAvg > 0) {
                labels.push({ key: "avg", y: chartMeta.avgLineY - 6, priority: 3 });
            }

            labels.sort((a, b) => a.y - b.y);
            for (let i = 1; i < labels.length; i++) {
                if (labels[i].y - labels[i - 1].y < 12) {
                    labels[i - 1].y -= 6;
                    labels[i].y += 6;
                }
            }

            const minY = chartMeta.CHART.padding.top + 10;
            const maxY = chartMeta.CHART.height - 6;
            const clamp = (value: number) => Math.min(Math.max(value, minY), maxY);

            const result: Record<string, number> = {};
            for (const l of labels) result[l.key] = clamp(l.y);
            return result;
        }, [chartMeta, totalPrev, dailyAvg]);

        useEffect(() => {
            setActiveIndex(null);
        }, [chartMeta?.points.length]);

        const findNearestIndex = useCallback(
            (clientX: number) => {
                if (!chartMeta || !chartRef.current) return null;
                const rect = chartRef.current.getBoundingClientRect();
                if (!rect.width) return null;
                const scale = rect.width / chartMeta.CHART.width;
                const left = chartMeta.CHART.padding.left * scale;
                const right = chartMeta.CHART.padding.right * scale;
                const inner = rect.width - left - right;
                if (inner <= 0) return null;
                const x = Math.min(Math.max(clientX - rect.left - left, 0), inner);
                const pct = x / inner;
                return Math.round(pct * (chartMeta.points.length - 1));
            },
            [chartMeta]
        );

        const handleMouseMove = useCallback((event: React.MouseEvent) => {
            if (rafId.current) return;
            rafId.current = requestAnimationFrame(() => {
                const idx = findNearestIndex(event.clientX);
                setActiveIndex((prev) => (prev === idx ? prev : idx));
                rafId.current = null;
            });
        }, [findNearestIndex]);

        const handleMouseLeave = useCallback(() => {
            setActiveIndex(null);
        }, []);

        const handleTap = useCallback((event: React.MouseEvent) => {
            const idx = findNearestIndex(event.clientX);
            setActiveIndex((prev) => (prev === idx ? null : idx));
        }, [findNearestIndex]);

        const handleTouchEnd = useCallback((event: React.TouchEvent) => {
            if (!event.changedTouches[0]) return;
            const idx = findNearestIndex(event.changedTouches[0].clientX);
            setActiveIndex((prev) => (prev === idx ? null : idx));
        }, [findNearestIndex]);

        if (isMetricsLoading) {
            return (
                <div className="space-y-2 w-full">
                    <div className="kk-skeleton h-3 w-20" />
                    <div className="kk-skeleton h-36 w-full rounded-xl" />
                </div>
            );
        }

        if (!chartReady || !chartMeta) {
            return (
                <div className="flex h-28 w-full items-center justify-center rounded-xl border border-dashed border-[var(--kk-smoke-heavy)] text-sm text-[var(--kk-ash)]">
                    Not enough data to chart
                </div>
            );
        }

        const isBarChart = useBarChart;
        const innerHeight = chartMeta.CHART.height - chartMeta.CHART.padding.top - chartMeta.CHART.padding.bottom;
        const yBottom = chartMeta.CHART.padding.top + innerHeight;

        return (
            <div
                ref={chartRef}
                className="relative w-full select-none"
                onMouseMove={isBarChart ? undefined : handleMouseMove}
                onMouseLeave={handleMouseLeave}
                onClick={isBarChart ? handleTap : undefined}
                onTouchEnd={handleTouchEnd}
            >
                <svg
                    aria-hidden
                    viewBox={`0 0 ${chartMeta.CHART.width} ${chartMeta.CHART.height}`}
                    className="h-52 w-full"
                >
                    {/* Subtle grid lines at Y ticks */}
                    {chartMeta.yTicks.map((tick) => {
                        const y =
                            chartMeta.CHART.padding.top +
                            (1 - (tick - chartMeta.yMin) / (chartMeta.yMax - chartMeta.yMin)) * innerHeight;
                        return (
                            <g key={`grid-${tick}`}>
                                <line
                                    x1={chartMeta.CHART.padding.left}
                                    x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                    y1={y}
                                    y2={y}
                                    stroke="var(--kk-smoke)"
                                    strokeWidth="0.5"
                                />
                                <text
                                    x={chartMeta.CHART.padding.left - 6}
                                    y={y + 3}
                                    textAnchor="end"
                                    className="fill-[var(--kk-ash)] text-[8px] font-[family:var(--font-mono)]"
                                >
                                    {currencySymbol}{formatCurrency(tick)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Previous period total — only on line chart (hourly) */}
                    {!isBarChart && totalPrev > 0 && (
                        <>
                            <line
                                x1={chartMeta.CHART.padding.left}
                                x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                y1={chartMeta.prevLineY}
                                y2={chartMeta.prevLineY}
                                stroke="var(--kk-ash)"
                                strokeDasharray="3 5"
                                strokeWidth="0.75"
                                opacity="0.5"
                            />
                            <text
                                x={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                y={labelPositions?.prev ?? chartMeta.prevLineY - 6}
                                textAnchor="end"
                                className="fill-[var(--kk-ash)] text-[8px] font-[family:var(--font-mono)]"
                                style={{ paintOrder: "stroke", stroke: "var(--kk-paper, white)", strokeWidth: 3 }}
                            >
                                Prev {currencySymbol}{formatCurrency(totalPrev)}
                            </text>
                        </>
                    )}

                    {/* Daily average — ocean accent */}
                    {dailyAvg > 0 && (
                        <>
                            <line
                                x1={chartMeta.CHART.padding.left}
                                x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                y1={chartMeta.avgLineY}
                                y2={chartMeta.avgLineY}
                                stroke="var(--kk-ocean)"
                                strokeDasharray="4 3"
                                strokeWidth="1"
                                opacity="0.55"
                            />
                            <text
                                x={chartMeta.CHART.padding.left + 2}
                                y={labelPositions?.avg ?? chartMeta.avgLineY - 6}
                                textAnchor="start"
                                className="fill-[var(--kk-ocean)] text-[8px] font-[family:var(--font-mono)] font-medium"
                                style={{ paintOrder: "stroke", stroke: "var(--kk-paper, white)", strokeWidth: 3 }}
                            >
                                Avg {currencySymbol}{formatCurrency(dailyAvg)}
                            </text>
                        </>
                    )}

                    {/* Current period total — only on line chart (hourly) */}
                    {!isBarChart && (
                        <>
                            <line
                                x1={chartMeta.CHART.padding.left}
                                x2={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                y1={chartMeta.baseLineY}
                                y2={chartMeta.baseLineY}
                                stroke="var(--kk-ember)"
                                strokeDasharray="6 4"
                                strokeLinecap="round"
                                strokeWidth={1}
                                opacity={0.45}
                            />
                            <text
                                x={chartMeta.CHART.width - chartMeta.CHART.padding.right}
                                y={labelPositions?.total ?? chartMeta.baseLineY - 6}
                                textAnchor="end"
                                className="fill-[var(--kk-ember)] text-[8px] font-[family:var(--font-mono)] font-semibold"
                                style={{ paintOrder: "stroke", stroke: "var(--kk-paper, white)", strokeWidth: 3 }}
                            >
                                Total {currencySymbol}{formatCurrency(totalBase)}
                            </text>
                        </>
                    )}

                    {/* Bar chart for day view — gradient fill with rounded caps */}
                    {isBarChart && (
                        <defs>
                            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--kk-ember)" stopOpacity="0.95" />
                                <stop offset="100%" stopColor="var(--kk-ember)" stopOpacity="0.55" />
                            </linearGradient>
                            <linearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="var(--kk-ember-deep)" stopOpacity="1" />
                                <stop offset="100%" stopColor="var(--kk-ember)" stopOpacity="0.85" />
                            </linearGradient>
                        </defs>
                    )}
                    {isBarChart && chartMeta.points.map((point, index) => {
                        const barH = Math.max(2, yBottom - point.y);
                        const isActive = activeIndex === index;
                        return (
                            <rect
                                key={`bar-${index}`}
                                x={point.x - chartMeta.barWidth / 2}
                                y={point.y}
                                width={chartMeta.barWidth}
                                height={barH}
                                rx={Math.min(3, chartMeta.barWidth / 2)}
                                fill={isActive ? "url(#barGradActive)" : "url(#barGrad)"}
                                className="transition-all duration-150"
                                style={isActive ? { filter: "drop-shadow(0 2px 4px rgba(255,107,53,0.3))" } : undefined}
                            />
                        );
                    })}

                    {/* Line chart for hourly view — smoother stroke */}
                    {!isBarChart && (
                        <>
                            {/* Area fill under line */}
                            <defs>
                                <linearGradient id="lineAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--kk-ember)" stopOpacity="0.12" />
                                    <stop offset="100%" stopColor="var(--kk-ember)" stopOpacity="0.02" />
                                </linearGradient>
                            </defs>
                            <path
                                d={`${chartMeta.linePath} L ${chartMeta.points[chartMeta.points.length - 1].x} ${yBottom} L ${chartMeta.points[0].x} ${yBottom} Z`}
                                fill="url(#lineAreaGrad)"
                            />
                            <path
                                d={chartMeta.linePath}
                                fill="none"
                                stroke="var(--kk-ember)"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </>
                    )}

                    {/* Active point indicator (line chart only) */}
                    {!isBarChart && activeIndex !== null && chartMeta.points[activeIndex] && (
                        <g>
                            <line
                                x1={chartMeta.points[activeIndex].x}
                                x2={chartMeta.points[activeIndex].x}
                                y1={chartMeta.CHART.padding.top}
                                y2={yBottom}
                                stroke="var(--kk-ash)"
                                strokeDasharray="2 4"
                                opacity="0.4"
                            />
                            <circle
                                cx={chartMeta.points[activeIndex].x}
                                cy={chartMeta.points[activeIndex].y}
                                r="4"
                                fill="var(--kk-ember)"
                                stroke="white"
                                strokeWidth="2"
                                style={{ filter: "drop-shadow(0 1px 3px rgba(255,107,53,0.4))" }}
                            />
                        </g>
                    )}

                    {/* X-axis labels */}
                    {chartMeta.xTickIdx.map((idx) => (
                        <text
                            key={`xlabel-${idx}`}
                            x={chartMeta.points[idx]?.x ?? 0}
                            y={chartMeta.CHART.height - 4}
                            textAnchor="middle"
                            className="fill-[var(--kk-ash)] text-[8px] font-[family:var(--font-mono)]"
                        >
                            {dayLabels[idx] ?? ""}
                        </text>
                    ))}
                </svg>

                {/* Tooltip — frosted glass */}
                <AnimatePresence>
                    {activeIndex !== null && chartMeta.points[activeIndex] && (
                        <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.12 }}
                            className="pointer-events-none absolute top-1 rounded-lg border border-[var(--kk-smoke)] bg-white/90 px-2.5 py-1.5 shadow-[var(--kk-shadow-sm)] backdrop-blur-sm"
                            style={{
                                left: `${(chartMeta.points[activeIndex].x / chartMeta.CHART.width) * 100}%`,
                                transform: "translateX(-50%)",
                            }}
                        >
                            <div className="text-xs font-bold text-[var(--kk-ink)] font-[family:var(--font-mono)] tabular-nums">
                                <span className="kk-currency text-[10px]">{currencySymbol}</span>{formatCurrency(chartMeta.points[activeIndex].value)}
                            </div>
                            <div className="text-[10px] text-[var(--kk-ash)] font-[family:var(--font-mono)]">
                                {bucket === "hour"
                                    ? new Date(chartMeta.points[activeIndex].ts).toLocaleTimeString(
                                        "en-IN",
                                        { hour: "2-digit", minute: "2-digit" }
                                    )
                                    : new Date(chartMeta.points[activeIndex].ts).toLocaleDateString(
                                        "en-IN",
                                        { day: "2-digit", month: "short" }
                                    )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }
);

TrendChart.displayName = "TrendChart";

// ========================
// METRICS DASHBOARD COMPONENT
// ========================

interface TrendMetrics {
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
}

interface AllocationMetrics {
    totalRange: number;
    topCategory: string | null;
    topShare: number;
    categories: { label: string; total: number }[];
    rangeCount: number;
}

interface MetricsDashboardProps {
    hasData: boolean;
    isMetricsLoading: boolean;

    // Trend data
    trendMetrics: TrendMetrics;
    chartMeta: ChartMeta | null;
    chartReady: boolean;
    dayLabels: string[];
    dailyAvg: number;
    useBarChart: boolean;

    // Category breakdown
    allocationMode: "amount" | "count";
    onAllocationModeChange: (mode: "amount" | "count") => void;
    allocationMetrics: AllocationMetrics;
    selectedCategory: string | null;
    onCategoryClick: (label: string | null) => void;

    // Utilities
    formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
    currencySymbol: string;
}

export const MetricsDashboard = memo(({
    hasData,
    isMetricsLoading,
    trendMetrics,
    chartMeta,
    chartReady,
    dayLabels,
    dailyAvg,
    useBarChart,
    allocationMode,
    onAllocationModeChange,
    allocationMetrics,
    selectedCategory,
    onCategoryClick,
    formatCurrency,
    currencySymbol,
}: MetricsDashboardProps) => {
    const handleAmountMode = useCallback(() => {
        onAllocationModeChange("amount");
    }, [onAllocationModeChange]);

    const handleCountMode = useCallback(() => {
        onAllocationModeChange("count");
    }, [onAllocationModeChange]);

    if (!hasData) return null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            className="mt-3 grid gap-2.5 lg:grid-cols-2"
        >
            {/* B. Spending Pattern */}
            <div className="kk-card overflow-hidden">
                <div className="px-3 pt-3 pb-1">
                    <div className="kk-label">Spending pattern</div>
                </div>
                <div className="px-1 pb-2">
                    <div className="relative w-full">
                        <TrendChart
                            chartMeta={chartMeta}
                            chartReady={chartReady}
                            isMetricsLoading={isMetricsLoading}
                            dayLabels={dayLabels}
                            bucket={trendMetrics.bucket}
                            useBarChart={useBarChart}
                            totalBase={trendMetrics.totalBase}
                            totalPrev={trendMetrics.totalPrev}
                            dailyAvg={dailyAvg}
                            formatCurrency={formatCurrency}
                            currencySymbol={currencySymbol}
                        />
                    </div>
                </div>
            </div>

            {/* C. Category Breakdown */}
            <div className="kk-card overflow-hidden">
                <div className="px-3 pt-3 pb-2">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="kk-label">Categories</div>
                            <div className="text-[10px] text-[var(--kk-ash)]">Tap to filter</div>
                        </div>
                        <div className="flex items-center rounded-full border border-[var(--kk-smoke)] p-0.5">
                            <button
                                type="button"
                                onClick={handleAmountMode}
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-all ${allocationMode === "amount"
                                    ? "bg-[var(--kk-ember)] text-white shadow-sm"
                                    : "text-[var(--kk-ash)] hover:text-[var(--kk-ink)]"
                                    }`}
                            >
                                Amount
                            </button>
                            <button
                                type="button"
                                onClick={handleCountMode}
                                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide transition-all ${allocationMode === "count"
                                    ? "bg-[var(--kk-ember)] text-white shadow-sm"
                                    : "text-[var(--kk-ash)] hover:text-[var(--kk-ink)]"
                                    }`}
                            >
                                Count
                            </button>
                        </div>
                    </div>
                </div>

                <div className="px-3 pb-3 space-y-0.5">
                    {isMetricsLoading ? (
                        <div className="space-y-3 py-2">
                            <div className="kk-skeleton h-8 w-full rounded-lg" />
                            <div className="kk-skeleton h-8 w-[85%] rounded-lg" />
                            <div className="kk-skeleton h-8 w-[65%] rounded-lg" />
                        </div>
                    ) : allocationMetrics.categories.length === 0 ? (
                        <div className="flex h-28 items-center justify-center text-sm text-[var(--kk-ash)]">
                            No categories yet
                        </div>
                    ) : (
                        allocationMetrics.categories.map((cat, index) => {
                            const pct = allocationMetrics.totalRange > 0
                                ? Math.round((cat.total / allocationMetrics.totalRange) * 100)
                                : 0;
                            const absoluteValue = allocationMode === "count"
                                ? String(cat.total)
                                : `${currencySymbol}${formatCurrency(cat.total)}`;
                            const isSelected = selectedCategory === cat.label;
                            const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length];

                            return (
                                <motion.button
                                    key={cat.label}
                                    type="button"
                                    onClick={() => onCategoryClick(isSelected ? null : cat.label)}
                                    whileTap={{ scale: 0.98 }}
                                    className={`w-full text-left transition-all rounded-lg px-2.5 py-2 ${isSelected
                                        ? "bg-[var(--kk-cream)] shadow-[inset_0_0_0_1.5px_var(--kk-smoke-heavy)]"
                                        : "hover:bg-[var(--kk-cream)]/40"
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2.5">
                                            <span
                                                className="h-2 w-2 rounded-full shrink-0 ring-2 ring-white"
                                                style={{ background: color, boxShadow: `0 0 0 2px white, 0 0 6px ${color}40` }}
                                            />
                                            <span className="text-[13px] font-medium text-[var(--kk-ink)]">{cat.label}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[13px] font-semibold text-[var(--kk-ink)] font-[family:var(--font-mono)] tabular-nums">
                                                {absoluteValue}
                                            </span>
                                            <span className="rounded-full bg-[var(--kk-smoke)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--kk-ash)] tabular-nums font-[family:var(--font-mono)]">
                                                {pct}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--kk-smoke)]">
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{ background: color }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1], delay: index * 0.05 }}
                                        />
                                    </div>
                                </motion.button>
                            );
                        })
                    )}
                </div>
            </div>
        </motion.div>
    );
});

MetricsDashboard.displayName = "MetricsDashboard";

export type { ChartMeta };
