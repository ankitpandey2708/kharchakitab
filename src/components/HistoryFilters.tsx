"use client";

import React, { useRef } from "react";
import { Calendar, ArrowRight, Download, Upload } from "lucide-react";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";

const FILTER_OPTIONS = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This Month" },
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

export const HistoryFilters = ({
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

    const focusDateInput = (ref: React.RefObject<HTMLInputElement | null>) => {
        const node = ref.current;
        if (!node) return;
        node.focus();
    };

    const handlePresetClick = (preset: FilterKey) => {
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
    };

    return (
        <div className="kk-radius-md kk-shadow-sm mt-4 border border-[var(--kk-smoke)] bg-[var(--kk-cream)]/70 p-3">
            {/* Search and Export Row */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative flex-1">
                    <input
                        value={query}
                        onChange={(event) => onQueryChange(event.target.value)}
                        placeholder="Search expenses..."
                        className="kk-input pl-4 text-sm shadow-[var(--kk-shadow-md)] sm:pl-10"
                    />
                </div>
                <div className="order-3 flex w-full gap-2 lg:order-none lg:w-auto">
                    <button
                        type="button"
                        onClick={onImport}
                        className="kk-btn-secondary kk-btn-compact flex-1 lg:flex-none"
                    >
                        <Upload className="h-3.5 w-3.5" />
                        Import
                    </button>
                    <button
                        type="button"
                        onClick={onExport}
                        disabled={isExporting || isExportDisabled}
                        className="kk-btn-secondary kk-btn-compact flex-1 lg:flex-none"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </button>
                </div>
            </div>

            {/* Filter Chips */}
            <div className="mt-3 flex w-full items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-left text-[var(--kk-ash)] opacity-80 transition">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-[var(--kk-smoke)] bg-white/60 px-4 py-2.5 transition-all focus-within:border-[var(--kk-smoke-heavy)] sm:rounded-full sm:px-3 sm:py-1">
                    {/* From Date */}
                    <label className="kk-label flex items-center gap-2">
                        <span className="w-10 shrink-0 opacity-70 sm:opacity-100">From</span>
                        <span className="flex items-center gap-0.5">
                            <input
                                key={`start-${filter}`}
                                type="date"
                                value={customStart}
                                ref={customStartRef}
                                onClick={() => {
                                    if (filter !== "custom") {
                                        onFilterChange("custom");
                                    }
                                    focusDateInput(customStartRef);
                                }}
                                onChange={(event) => {
                                    if (filter !== "custom") onFilterChange("custom");
                                    onCustomStartChange(event.target.value);
                                }}
                                className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                                type="button"
                                aria-label="Open start date picker"
                                onClick={() => {
                                    if (filter !== "custom") {
                                        onFilterChange("custom");
                                    }
                                    focusDateInput(customStartRef);
                                }}
                                className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kk-ember)]/40 disabled:pointer-events-none"
                            >
                                <Calendar className="h-3.5 w-3.5" />
                            </button>
                        </span>
                    </label>

                    <ArrowRight className="hidden h-3 w-3 text-[var(--kk-ash)] sm:block" />

                    {/* To Date */}
                    <label className="kk-label flex items-center gap-2">
                        <span className="w-10 shrink-0 opacity-70 sm:opacity-100">To</span>
                        <span className="flex items-center gap-0.5">
                            <input
                                key={`end-${filter}`}
                                type="date"
                                value={customEnd}
                                min={customStart || undefined}
                                ref={customEndRef}
                                onClick={() => {
                                    if (filter !== "custom") {
                                        onFilterChange("custom");
                                    }
                                    focusDateInput(customEndRef);
                                }}
                                onChange={(event) => {
                                    if (filter !== "custom") onFilterChange("custom");
                                    onCustomEndChange(event.target.value);
                                }}
                                className="kk-input kk-input-compact kk-date-input w-[6.25rem] bg-transparent normal-case text-[var(--kk-ink)] outline-none disabled:pointer-events-none disabled:cursor-default disabled:text-[var(--kk-ash)] sm:w-[7rem]"
                            />
                            <button
                                type="button"
                                aria-label="Open end date picker"
                                onClick={() => {
                                    if (filter !== "custom") {
                                        onFilterChange("custom");
                                    }
                                    focusDateInput(customEndRef);
                                }}
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
};
