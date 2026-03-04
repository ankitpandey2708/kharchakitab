// PERF-RERENDER: Wrapped in React.memo to prevent re-renders when parent HistoryView updates but filter props stay the same

"use client";

import React, { memo, useCallback, useRef } from "react";
import { Calendar, ArrowRight, Download, Upload } from "lucide-react";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";

const FILTER_OPTIONS = [
    { key: "today", label: "Today" },
    { key: "last7", label: "Last 7d" },
    { key: "last30", label: "Last 30d" },
    { key: "month", label: "This Month" },
    { key: "lastMonth", label: "Last Month" },
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
        // Immediately update date inputs for preset filters
        if (preset !== "custom") {
            const nextRange = getRangeForFilter(preset);
            if (nextRange) {
                const startVal = toDateInputValue(nextRange.start);
                const endVal = toDateInputValue(nextRange.end);
                onCustomStartChange(startVal);
                onCustomEndChange(endVal);
                // Also set debounced values immediately for presets
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

    return (
        <div className="kk-radius-md kk-shadow-sm mt-4 border border-[var(--kk-smoke)] bg-[var(--kk-cream)]/70 p-3">
            {/* Search and Action Row */}
            <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <input
                        value={query}
                        onChange={handleQueryChange}
                        placeholder="Search expenses..."
                        className="kk-input pl-4 text-sm shadow-[var(--kk-shadow-md)] sm:pl-10"
                    />
                </div>
                <div className="flex shrink-0 gap-1.5">
                    <button
                        type="button"
                        onClick={onImport}
                        className="kk-btn-secondary kk-btn-compact"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Import</span>
                    </button>
                    <button
                        type="button"
                        onClick={onExport}
                        disabled={isExporting || isExportDisabled}
                        className="kk-btn-secondary kk-btn-compact"
                    >
                        <Download className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Filter Chips */}
            <div className="mt-2.5 flex w-full items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {FILTER_OPTIONS.map((option) => (
                    <button
                        key={option.key}
                        type="button"
                        onClick={() => handlePresetClick(option.key as FilterKey)}
                        className={`kk-chip kk-chip-filter whitespace-nowrap transition ${filter === option.key ? "kk-chip-active" : "kk-chip-muted"
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            {/* Date Range Picker */}
            <div className="mt-2 text-left text-[var(--kk-ash)] opacity-80 transition">
                <div className="flex w-full items-center gap-2 rounded-2xl border border-[var(--kk-smoke)] bg-white/60 px-3 py-2 transition-all focus-within:border-[var(--kk-smoke-heavy)] sm:inline-flex sm:w-auto sm:rounded-full sm:py-1">
                    {/* From Date */}
                    <label className="kk-label flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                        <span className="shrink-0 text-[10px] opacity-70">From</span>
                        <span className="flex items-center gap-0.5">
                            <input
                                key={`start-${filter}`}
                                type="date"
                                value={customStart}
                                ref={customStartRef}
                                onClick={handleStartDateClick}
                                onChange={handleCustomStartChange}
                                className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                                type="button"
                                aria-label="Open start date picker"
                                onClick={handleStartDateClick}
                                className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kk-ember)]/40 disabled:pointer-events-none"
                            >
                                <Calendar className="h-3.5 w-3.5" />
                            </button>
                        </span>
                    </label>

                    <ArrowRight className="hidden h-3 w-3 shrink-0 text-[var(--kk-ash)] sm:block" />

                    {/* To Date */}
                    <label className="kk-label flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
                        <span className="shrink-0 text-[10px] opacity-70">To</span>
                        <span className="flex items-center gap-0.5">
                            <input
                                key={`end-${filter}`}
                                type="date"
                                value={customEnd}
                                min={customStart || undefined}
                                ref={customEndRef}
                                onClick={handleEndDateClick}
                                onChange={handleCustomEndChange}
                                className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                                type="button"
                                aria-label="Open end date picker"
                                onClick={handleEndDateClick}
                                className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kk-ember)]/40 disabled:pointer-events-none"
                            >
                                <Calendar className="h-3.5 w-3.5" />
                            </button>
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
});

HistoryFilters.displayName = "HistoryFilters";
