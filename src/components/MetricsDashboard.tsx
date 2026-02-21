"use client";

import React, { useMemo } from "react";

// ========================
// TREND CHART COMPONENT
// ========================

interface ChartMeta {
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
}

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
        const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
        const chartRef = React.useRef<HTMLDivElement | null>(null);

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

        React.useEffect(() => {
            setHoverIndex(null);
        }, [chartMeta?.points.length]);

        const updateHover = React.useCallback(
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
                                y2={chartMeta.CHART.height - chartMeta.CHART.padding.bottom}
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
                            left: `${(chartMeta.points[hoverIndex].x / chartMeta.CHART.width) * 100}%`,
                            transform: "translateX(-50%)",
                        }}
                    >
                        <div className="kk-micro font-semibold text-[var(--kk-ink)]">
                            <span className="kk-rupee">₹</span>{formatCurrency(chartMeta.points[hoverIndex].value)}
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

TrendChart.displayName = "TrendChart";

// ========================
// DONUT SEGMENT TYPE
// ========================

interface DonutSegment {
    color: string;
    dashArray: string;
    offset: number;
}

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
    topCategories: { label: string; total: number }[];
    rangeCount: number;
}

interface MetricsDashboardProps {
    // Visibility flags
    shouldShowMetrics: boolean;
    shouldShowTrends: boolean;
    shouldShowSummary: boolean;

    // Loading state
    isMetricsLoading: boolean;

    // Trend data
    trendMetrics: TrendMetrics;
    trendRangeLabels: { current: string; previous: string };
    chartMeta: ChartMeta | null;
    chartReady: boolean;
    dayLabels: string[];
    hasPrevData: boolean;
    deltaLabel: string;
    percentLabel: string;

    // Allocation data
    allocationMode: "amount" | "count";
    onAllocationModeChange: (mode: "amount" | "count") => void;
    allocationMetrics: AllocationMetrics;
    donutSegments: DonutSegment[];

    // Utilities
    formatCurrency: (value: number, options?: Intl.NumberFormatOptions) => string;
}

export const MetricsDashboard = ({
    shouldShowMetrics,
    shouldShowTrends,
    shouldShowSummary,
    isMetricsLoading,
    trendMetrics,
    trendRangeLabels,
    chartMeta,
    chartReady,
    dayLabels,
    hasPrevData,
    deltaLabel,
    percentLabel,
    allocationMode,
    onAllocationModeChange,
    allocationMetrics,
    donutSegments,
    formatCurrency,
}: MetricsDashboardProps) => {
    if (!shouldShowMetrics) return null;

    return (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {/* Trends Panel */}
            {shouldShowTrends && (
                <div className="kk-surface kk-shadow-sm p-4">
                    <div className="flex flex-col gap-3">
                        <div>
                            <div className="kk-label">Trends</div>
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
                                    <span className="text-[var(--kk-ash)]"></span>
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

            {/* Summary / Allocation Panel */}
            {shouldShowSummary && (
                <div className="kk-surface kk-shadow-sm p-4">
                    <div className="kk-label">Summary</div>
                    <div className="mt-2 flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onAllocationModeChange("amount")}
                            className={`kk-chip kk-chip-filter transition ${allocationMode === "amount" ? "kk-chip-active" : "kk-chip-muted"
                                }`}
                        >
                            Amount
                        </button>
                        <button
                            type="button"
                            onClick={() => onAllocationModeChange("count")}
                            className={`kk-chip kk-chip-filter transition ${allocationMode === "count" ? "kk-chip-active" : "kk-chip-muted"
                                }`}
                        >
                            Count
                        </button>
                    </div>
                    <div className="mt-4 flex min-h-[160px] flex-col items-center justify-center gap-5">
                        {/* Donut Chart */}
                        {donutSegments.length >= 1 ? (
                            <svg aria-hidden viewBox="0 0 42 42" className="h-28 w-28">
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

                        {/* Category Breakdown */}
                        <div
                            className={`grid gap-x-6 gap-y-2 text-[13px] text-[var(--kk-ash)] ${allocationMetrics.topCategories.length <= 1
                                    ? "justify-items-center text-center"
                                    : "grid-cols-1 sm:grid-cols-2"
                                }`}
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
                                            <span className="text-[var(--kk-ink)]">{category.label}</span>
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
    );
};

export type { ChartMeta, DonutSegment };
