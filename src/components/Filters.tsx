// PERF-RERENDER: Wrapped in React.memo to prevent re-renders when parent AnalyticsView updates but filter props stay the same

"use client";

import React, { memo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Calendar, ArrowRight, Download, Upload } from "lucide-react";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";

const FILTER_OPTIONS = [
    { key: "today", label: "Today" },
    { key: "last7", label: "7 days" },
    { key: "last30", label: "30 days" },
    { key: "month", label: "This mo." },
    { key: "lastMonth", label: "Last mo." },
    { key: "custom", label: "Custom" },
] as const;

interface HistoryFiltersProps {
    query: string;
    onQueryChange: (value: string) => void;
    filter: FilterKey;
    onFilterChange: (value: FilterKey) => void;
    customStart: string;
    customEnd: string;
    onCustomStartChange: (value: string) => void;
    onCustomEndChange: (value: string) => void;
    onDebouncedStartChange: (value: string) => void;
    onDebouncedEndChange: (value: string) => void;
    isExporting: boolean;
    isExportDisabled: boolean;
    onExport: () => void;
    onImport: () => void;
}

export const HistoryFilters = memo(({
    query,
    onQueryChange,
    filter,
    onFilterChange,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    onDebouncedStartChange,
    onDebouncedEndChange,
    isExporting,
    isExportDisabled,
    onExport,
    onImport,
}: HistoryFiltersProps) => {
    const customStartRef = useRef<HTMLInputElement | null>(null);
    const customEndRef = useRef<HTMLInputElement | null>(null);
    const focusDateInput = useCallback((ref: React.RefObject<HTMLInputElement | null>) => {
        const node = ref.current;
        if (!node) return;
        node.focus();
    }, []);

    const handlePresetClick = useCallback((preset: FilterKey) => {
        onFilterChange(preset);
        if (preset !== "custom") {
            const nextRange = getRangeForFilter(preset);
            if (nextRange) {
                const startVal = toDateInputValue(nextRange.start);
                const endVal = toDateInputValue(nextRange.end);
                onCustomStartChange(startVal);
                onCustomEndChange(endVal);
                onDebouncedStartChange(startVal);
                onDebouncedEndChange(endVal);
            }
        }
    }, [onFilterChange, onCustomStartChange, onCustomEndChange, onDebouncedStartChange, onDebouncedEndChange]);

    const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        onQueryChange(event.target.value);
    }, [onQueryChange]);

    const handleCustomStartChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (filter !== "custom") onFilterChange("custom");
        onCustomStartChange(event.target.value);
    }, [filter, onFilterChange, onCustomStartChange]);

    const handleCustomEndChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        if (filter !== "custom") onFilterChange("custom");
        onCustomEndChange(event.target.value);
    }, [filter, onFilterChange, onCustomEndChange]);

    const handleStartDateClick = useCallback(() => {
        if (filter !== "custom") {
            onFilterChange("custom");
        }
        focusDateInput(customStartRef);
    }, [filter, onFilterChange, focusDateInput]);

    const handleEndDateClick = useCallback(() => {
        if (filter !== "custom") {
            onFilterChange("custom");
        }
        focusDateInput(customEndRef);
    }, [filter, onFilterChange, focusDateInput]);

    const isCustom = filter === "custom";

    return (
        <div className="mt-4 space-y-3">
            {/* ── Search + Import ── */}
            <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--kk-ash)]" />
                    <input
                        value={query}
                        onChange={handleQueryChange}
                        placeholder="Search expenses..."
                        className="kk-input pl-10 pr-4 text-sm"
                    />
                </div>
                <button
                    type="button"
                    onClick={onImport}
                    className="kk-icon-btn shrink-0 !h-8 !w-8"
                    aria-label="Import"
                >
                    <Upload className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* ── Filter chips + Export ── */}
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className="flex items-center gap-1.5">
                        {FILTER_OPTIONS.map((option) => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => handlePresetClick(option.key as FilterKey)}
                                className={`kk-chip kk-chip-filter whitespace-nowrap ${filter === option.key ? "kk-chip-active" : "kk-chip-muted"
                                    }`}
                            >
                                {option.key}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    type="button"
                    onClick={onExport}
                    disabled={isExporting || isExportDisabled}
                    className="kk-icon-btn shrink-0 !h-8 !w-8"
                    aria-label="Export"
                >
                    <Download className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* ── Custom date picker (contextual — only when "Custom" is active) ── */}
            <AnimatePresence initial={false}>
                {isCustom && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div className="flex items-center gap-2 rounded-2xl border border-[var(--kk-smoke-heavy)] bg-white/80 px-3 py-2.5 sm:inline-flex sm:rounded-full sm:py-1.5">
                            {/* From */}
                            <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                                <span className="kk-label shrink-0 !text-[10px] opacity-60">From</span>
                                <span className="flex items-center">
                                    <input
                                        key={`start-${filter}`}
                                        type="date"
                                        value={customStart}
                                        ref={customStartRef}
                                        onClick={handleStartDateClick}
                                        onChange={handleCustomStartChange}
                                        className="kk-input kk-input-compact kk-date-input w-[6.5rem] border-none bg-transparent normal-case text-[var(--kk-ink)] shadow-none outline-none sm:w-[7rem]"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Open start date picker"
                                        onClick={handleStartDateClick}
                                        className="kk-icon-btn kk-icon-btn-ghost !h-7 !w-7 -ml-1"
                                    >
                                        <Calendar className="h-3 w-3" />
                                    </button>
                                </span>
                            </label>

                            <ArrowRight className="hidden h-3 w-3 shrink-0 text-[var(--kk-ash)]/40 sm:block" />

                            {/* To */}
                            <label className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                                <span className="kk-label shrink-0 !text-[10px] opacity-60">To</span>
                                <span className="flex items-center">
                                    <input
                                        key={`end-${filter}`}
                                        type="date"
                                        value={customEnd}
                                        min={customStart || undefined}
                                        ref={customEndRef}
                                        onClick={handleEndDateClick}
                                        onChange={handleCustomEndChange}
                                        className="kk-input kk-input-compact kk-date-input w-[6.5rem] border-none bg-transparent normal-case text-[var(--kk-ink)] shadow-none outline-none sm:w-[7rem]"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Open end date picker"
                                        onClick={handleEndDateClick}
                                        className="kk-icon-btn kk-icon-btn-ghost !h-7 !w-7 -ml-1"
                                    >
                                        <Calendar className="h-3 w-3" />
                                    </button>
                                </span>
                            </label>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
});

HistoryFilters.displayName = "HistoryFilters";
