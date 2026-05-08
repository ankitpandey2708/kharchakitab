// PERF-RERENDER: Wrapped in React.memo to prevent re-renders when parent AnalyticsView updates but filter props stay the same

"use client";

import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, ArrowRight, Download, Upload, Tag as TagIcon } from "lucide-react";
import { FilterKey, getRangeForFilter, toDateInputValue } from "@/src/utils/dates";
import { getAllTags } from "@/src/db/db";
import type { Tag } from "@/src/types";
import { ScrollFade } from "@/src/components/ScrollFade";

const FILTER_OPTIONS = [
    { key: "today", label: "Today" },
    { key: "month", label: "This mo." },
    { key: "lastMonth", label: "Last mo." },
    { key: "custom", label: "Custom" },
] as const;

interface HistoryFiltersProps {
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
    selectedTagIds: string[];
    onTagFilterChange: (ids: string[]) => void;
    tagsVersion?: number;
}

export const HistoryFilters = memo(({
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
    selectedTagIds,
    onTagFilterChange,
    tagsVersion,
}: HistoryFiltersProps) => {
    const customStartRef = useRef<HTMLInputElement | null>(null);
    const customEndRef = useRef<HTMLInputElement | null>(null);
    const [tags, setTags] = useState<Tag[]>([]);

    const focusDateInput = useCallback((ref: React.RefObject<HTMLInputElement | null>) => {
        const node = ref.current;
        if (!node) return;
        node.focus();
    }, []);

    useEffect(() => {
        getAllTags().then(setTags);
    }, [tagsVersion]);

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

    const handleCustomChange = useCallback(
        (setter: (v: string) => void, value: string) => {
            if (filter !== "custom") onFilterChange("custom");
            setter(value);
        },
        [filter, onFilterChange]
    );

    const handleDateClick = useCallback(
        (ref: React.RefObject<HTMLInputElement | null>) => {
            if (filter !== "custom") onFilterChange("custom");
            focusDateInput(ref);
        },
        [filter, onFilterChange, focusDateInput]
    );

    const toggleTag = useCallback((id: string) => {
        if (selectedTagIds.includes(id)) {
            onTagFilterChange(selectedTagIds.filter((t) => t !== id));
        } else {
            onTagFilterChange([...selectedTagIds, id]);
        }
    }, [selectedTagIds, onTagFilterChange]);

    const isCustom = filter === "custom";

    return (
        <div className="mt-4 space-y-3">
            {/* ── Filter chips + Import + Export ── */}
            <div className="flex items-center gap-2">
                <ScrollFade className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 pr-6">
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
                </ScrollFade>

                <button
                    type="button"
                    onClick={onImport}
                    className="kk-icon-btn shrink-0 !h-8 !w-8"
                    aria-label="Import"
                >
                    <Upload className="h-3.5 w-3.5" />
                </button>
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

            {/* ── Tag filter chips (shown when tags exist) ── */}
            {tags.length > 0 && (
                <div className="flex items-center gap-2">
                    <TagIcon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--kk-ash)]" />
                    <ScrollFade className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 pr-6">
                            {tags.map((tag) => {
                                const active = selectedTagIds.includes(tag.id);
                                return (
                                    <button
                                        key={tag.id}
                                        type="button"
                                        onClick={() => toggleTag(tag.id)}
                                        className="kk-chip kk-chip-filter whitespace-nowrap flex items-center gap-1.5 transition-all"
                                        style={active ? {
                                            backgroundColor: `${tag.color}18`,
                                            color: tag.color,
                                            borderColor: `${tag.color}60`,
                                        } : undefined}
                                    >
                                        <span
                                            className="h-2 w-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: tag.color }}
                                        />
                                        {tag.name}
                                    </button>
                                );
                            })}
                        </div>
                    </ScrollFade>
                    {selectedTagIds.length > 0 && (
                        <button
                            type="button"
                            onClick={() => onTagFilterChange([])}
                            className="shrink-0 text-[11px] font-semibold text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}

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
                                        onClick={() => handleDateClick(customStartRef)}
                                        onChange={(e) => handleCustomChange(onCustomStartChange, e.target.value)}
                                        className="kk-input kk-input-compact kk-date-input w-[6.5rem] border-none bg-transparent normal-case text-[var(--kk-ink)] shadow-none outline-none sm:w-[7rem]"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Open start date picker"
                                        onClick={() => handleDateClick(customStartRef)}
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
                                        onClick={() => handleDateClick(customEndRef)}
                                        onChange={(e) => handleCustomChange(onCustomEndChange, e.target.value)}
                                        className="kk-input kk-input-compact kk-date-input w-[6.5rem] border-none bg-transparent normal-case text-[var(--kk-ink)] shadow-none outline-none sm:w-[7rem]"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Open end date picker"
                                        onClick={() => handleDateClick(customEndRef)}
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
