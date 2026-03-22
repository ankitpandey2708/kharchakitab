"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { HouseholdBudgets } from "@/src/types";
import { syncEvents } from "@/src/services/sync/syncEvents";

const KK_BUDGETS_PERSONAL = "kk_budgets";
const KK_BUDGETS_HOUSEHOLD = "kk_budgets_household";

interface BudgetCardProps {
    currencySymbol: string;
    formatCurrency: (amount: number) => string;
    viewTotal: number;
    selectedMonthKey: string;
    isHousehold: boolean;
    householdTotal?: number;
    deviceId?: string;
    partnerName?: string;
}

// ─── Ring Chart ───────────────────────────────────────────────
const RingChart = ({ percent, overspend }: { percent: number; overspend: boolean }) => (
    <div className="relative flex-shrink-0">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
            <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="var(--kk-smoke)"
                strokeWidth="3"
            />
            <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={overspend ? "var(--kk-danger)" : "var(--kk-ember)"}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(Math.min(percent * 100, 100), percent > 0 ? 3 : 0)}, 100`}
                className="transition-all duration-500"
            />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-xs font-bold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ember)]"}`}>
                {Math.round(percent * 100)}%
            </span>
        </div>
    </div>
);

// ─── Budget Editor (inline) ──────────────────────────────────
const BudgetEditor = ({
    currencySymbol,
    placeholder,
    draft,
    setDraft,
    error,
    hasBudget,
    onSave,
    onCancel,
}: {
    currencySymbol: string;
    placeholder: string;
    draft: string;
    setDraft: (v: string) => void;
    error: string | null;
    hasBudget: boolean;
    onSave: () => void;
    onCancel: () => void;
}) => (
    <div className="space-y-3">
        <div className="flex items-center gap-2">
            <span className="kk-pill bg-white">{currencySymbol}</span>
            <input
                type="number"
                min="1"
                inputMode="decimal"
                placeholder={placeholder}
                value={draft}
                onChange={(event) => {
                    const next = event.target.value;
                    if (next.trim().startsWith("-")) return;
                    setDraft(next);
                }}
                className="kk-input h-9 text-sm flex-1"
                autoFocus
            />
        </div>
        {error && (
            <div className="kk-meta text-[var(--kk-ember)]">{error}</div>
        )}
        <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={onCancel} className="kk-btn-secondary kk-btn-compact">
                {hasBudget ? "Cancel" : "Close"}
            </button>
            <button type="button" onClick={onSave} className="kk-btn-primary kk-btn-compact">
                Save
            </button>
        </div>
    </div>
);

// ─── Main Component ──────────────────────────────────────────
export const BudgetCard = React.memo(({
    currencySymbol,
    formatCurrency,
    viewTotal,
    selectedMonthKey,
    isHousehold,
    householdTotal,
    deviceId,
    partnerName,
}: BudgetCardProps) => {
    // ── Personal budget state ─────────────────────────────────
    const [personalBudgets, setPersonalBudgets] = useState<Record<string, number>>({});

    // ── Household budget state ────────────────────────────────
    const [householdBudgets, setHouseholdBudgets] = useState<HouseholdBudgets>({});

    // ── Editor state ──────────────────────────────────────────
    const [editTarget, setEditTarget] = useState<"household" | "personal" | null>(null);
    const [budgetDraft, setBudgetDraft] = useState("");
    const [budgetError, setBudgetError] = useState<string | null>(null);

    const currentMonthKey = useMemo(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }, []);

    const isCurrentMonth = selectedMonthKey === currentMonthKey;

    // ── Load from localStorage ────────────────────────────────
    useEffect(() => {
        try {
            const storedPersonal = window.localStorage.getItem(KK_BUDGETS_PERSONAL);
            if (storedPersonal) {
                const parsed = JSON.parse(storedPersonal);
                setPersonalBudgets(typeof parsed === "object" && parsed !== null ? parsed : {});
            }
        } catch { setPersonalBudgets({}); }

        try {
            const storedHousehold = window.localStorage.getItem(KK_BUDGETS_HOUSEHOLD);
            if (storedHousehold) {
                const parsed = JSON.parse(storedHousehold);
                setHouseholdBudgets(typeof parsed === "object" && parsed !== null ? parsed : {});
            }
        } catch { setHouseholdBudgets({}); }
    }, [selectedMonthKey]);

    // Reload household budgets on sync (same-tab via syncEvents) and cross-tab (storage event)
    useEffect(() => {
        const reload = () => {
            try {
                const stored = window.localStorage.getItem(KK_BUDGETS_HOUSEHOLD);
                const parsed = stored ? JSON.parse(stored) : {};
                setHouseholdBudgets(typeof parsed === "object" && parsed !== null ? parsed : {});
            } catch { /* ignore */ }
        };
        const offRefresh = syncEvents.on("sync:refresh", reload);
        const offComplete = syncEvents.on("sync:complete", reload);
        window.addEventListener("storage", reload);
        return () => {
            offRefresh();
            offComplete();
            window.removeEventListener("storage", reload);
        };
    }, []);

    // ── Derived values ────────────────────────────────────────
    const personalAmount = personalBudgets[selectedMonthKey] ?? null;
    const hasPersonalBudget = typeof personalAmount === "number" && personalAmount > 0;

    const householdEntry = householdBudgets[selectedMonthKey] ?? null;
    const householdAmount = householdEntry && householdEntry.amount > 0 ? householdEntry.amount : null;
    const hasHouseholdBudget = typeof householdAmount === "number" && householdAmount > 0;

    // #14: On disconnect (household→solo), auto-copy HH budget into personal if personal is empty
    useEffect(() => {
        if (!isHousehold && !hasPersonalBudget && hasHouseholdBudget && householdAmount) {
            setPersonalBudgets((prev) => {
                if (prev[selectedMonthKey]) return prev; // already set, skip
                const next = { ...prev, [selectedMonthKey]: householdAmount };
                window.localStorage.setItem(KK_BUDGETS_PERSONAL, JSON.stringify(next));
                return next;
            });
        }
    }, [isHousehold, hasPersonalBudget, hasHouseholdBudget, householdAmount, selectedMonthKey]);

    // #6: In household mode without HH budget, fall back to personal budget as primary
    const householdFallback = isHousehold && !hasHouseholdBudget && hasPersonalBudget;
    const primaryAmount = isHousehold
        ? (hasHouseholdBudget ? householdAmount : (householdFallback ? personalAmount : null))
        : personalAmount;
    const hasPrimaryBudget = isHousehold
        ? (hasHouseholdBudget || householdFallback)
        : hasPersonalBudget;
    const primaryTotal = isHousehold && !householdFallback
        ? (householdTotal ?? viewTotal)
        : viewTotal;

    const { remaining, overspend, budgetPercent } = useMemo(() => {
        if (!hasPrimaryBudget || primaryAmount === null) {
            return { remaining: null, overspend: false, budgetPercent: 0 };
        }
        const raw = primaryAmount - primaryTotal;
        return {
            remaining: Math.max(raw, 0),
            overspend: raw < 0,
            budgetPercent: Math.min(primaryTotal / primaryAmount, 1),
        };
    }, [primaryAmount, hasPrimaryBudget, primaryTotal]);

    // Personal limit within household (footer row)
    const personalInHousehold = useMemo(() => {
        if (!isHousehold || !hasPersonalBudget || personalAmount === null) return null;
        const raw = personalAmount - viewTotal;
        return {
            amount: personalAmount,
            remaining: Math.max(raw, 0),
            overspend: raw < 0,
        };
    }, [isHousehold, hasPersonalBudget, personalAmount, viewTotal]);

    // Attribution for household budget
    const attribution = useMemo(() => {
        if (!isHousehold || !householdEntry || !deviceId) return null;
        const isYou = householdEntry.set_by === deviceId;
        const name = isYou ? "you" : (partnerName ?? "Partner");
        const ago = Date.now() - householdEntry.updated_at;
        const days = Math.floor(ago / 86400000);
        const timeLabel = days === 0 ? "today" : days === 1 ? "yesterday" : `${days}d ago`;
        return `Set by ${name} ${timeLabel}`;
    }, [isHousehold, householdEntry, deviceId, partnerName]);

    const budgetLabel = isHousehold
        ? (householdFallback ? "Monthly Budget" : "Household Budget")
        : "Monthly Budget";

    const resetHintLabel = useMemo(() => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
        return `Resets on ${nextMonth.toLocaleDateString("en-IN", {
            month: "short",
            day: "2-digit",
        })}`;
    }, []);

    // ── Save handlers ─────────────────────────────────────────
    const validateAndParse = useCallback((): number | null => {
        if (budgetDraft.trim() === "") {
            setBudgetError("Enter a positive number");
            return null;
        }
        const parsed = Number(budgetDraft);
        if (!Number.isFinite(parsed)) {
            setBudgetError("Enter a positive number");
            return null;
        }
        setBudgetError(null);
        return parsed;
    }, [budgetDraft]);

    const handleHouseholdSave = useCallback(() => {
        const parsed = validateAndParse();
        if (parsed === null) return;
        setHouseholdBudgets((prev) => {
            const next = { ...prev };
            if (parsed === 0) {
                // Soft delete — keep entry with amount=0 so it syncs as "removed"
                next[selectedMonthKey] = { amount: 0, updated_at: Date.now(), set_by: deviceId ?? "" };
            } else {
                next[selectedMonthKey] = { amount: parsed, updated_at: Date.now(), set_by: deviceId ?? "" };
            }
            window.localStorage.setItem(KK_BUDGETS_HOUSEHOLD, JSON.stringify(next));
            return next;
        });
        setEditTarget(null);
    }, [validateAndParse, selectedMonthKey, deviceId]);

    const handlePersonalSave = useCallback(() => {
        const parsed = validateAndParse();
        if (parsed === null) return;
        setPersonalBudgets((prev) => {
            const next = { ...prev };
            if (parsed === 0) delete next[selectedMonthKey];
            else next[selectedMonthKey] = parsed;
            window.localStorage.setItem(KK_BUDGETS_PERSONAL, JSON.stringify(next));
            return next;
        });
        setEditTarget(null);
    }, [validateAndParse, selectedMonthKey]);

    const openEditor = useCallback((target: "household" | "personal") => {
        setBudgetError(null);
        if (target === "household") {
            setBudgetDraft(householdAmount ? String(householdAmount) : "");
        } else {
            setBudgetDraft(personalAmount ? String(personalAmount) : "");
        }
        setEditTarget(target);
    }, [householdAmount, personalAmount]);

    // ── Render: Past month, no budget at all → hidden ──────────
    if (!hasPrimaryBudget && !isCurrentMonth) return null;

    // ── Render: No budget, not editing → ghost button ─────────
    if (!hasPrimaryBudget && editTarget === null) {
        return (
            <button
                type="button"
                onClick={() => openEditor(isHousehold ? "household" : "personal")}
                className="w-full text-center text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors py-1"
            >
                + Set {isHousehold ? "household" : "monthly"} budget
            </button>
        );
    }

    // ── Render: Card ──────────────────────────────────────────
    return (
        <div className="relative overflow-hidden rounded-[var(--kk-radius-md)] bg-gradient-to-br from-white/80 to-[var(--kk-cream)]/60 p-5">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--kk-ember)]/5 to-transparent" />

            {/* Header */}
            <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="kk-label">{budgetLabel}</div>
                    {isCurrentMonth && !householdFallback && <div className="kk-meta mt-1">{resetHintLabel}</div>}
                    {attribution && <div className="kk-meta mt-0.5">{attribution}</div>}
                    {householdFallback && isCurrentMonth && (
                        <button
                            type="button"
                            onClick={() => openEditor("household")}
                            className="kk-meta mt-1 text-[var(--kk-ember)] hover:text-[var(--kk-ember-ink)] transition-colors"
                        >
                            + Set a household budget
                        </button>
                    )}
                </div>
                <div className="flex-shrink-0">
                    {editTarget === null && hasPrimaryBudget && isCurrentMonth && (
                        <button
                            type="button"
                            onClick={() => openEditor(
                                isHousehold && !householdFallback ? "household" : "personal"
                            )}
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

            {/* Body */}
            <div className="relative mt-4">
                {editTarget === "household" || (editTarget === "personal" && (!isHousehold || householdFallback)) ? (
                    <BudgetEditor
                        currencySymbol={currencySymbol}
                        placeholder={editTarget === "household" ? "Enter household budget" : `Enter ${budgetLabel.toLowerCase()}`}
                        draft={budgetDraft}
                        setDraft={setBudgetDraft}
                        error={budgetError}
                        hasBudget={editTarget === "household" ? hasHouseholdBudget : hasPersonalBudget}
                        onSave={editTarget === "household" ? handleHouseholdSave : handlePersonalSave}
                        onCancel={() => setEditTarget(null)}
                    />
                ) : hasPrimaryBudget ? (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                                <span className="kk-meta">Remaining</span>
                            </div>
                            <div
                                className={`mt-0.5 text-xl font-semibold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ink)]"}`}
                            >
                                {overspend
                                    ? <span>-<span className="kk-currency">{currencySymbol}</span>{formatCurrency((primaryAmount ?? 0) - (remaining ?? 0))}</span>
                                    : <span><span className="kk-currency">{currencySymbol}</span>{formatCurrency(remaining ?? 0)}</span>}
                            </div>
                            <div className="mt-2 text-xs text-[var(--kk-ash)]">
                                of <span className="font-medium text-[var(--kk-ink)]"><span className="kk-currency">{currencySymbol}</span>{formatCurrency(primaryAmount ?? 0)}</span> total
                            </div>
                        </div>
                        <RingChart percent={budgetPercent} overspend={overspend} />
                    </div>
                ) : null}
            </div>

            {/* ── Personal limit footer (household mode with HH budget set) ──── */}
            {isHousehold && hasHouseholdBudget && editTarget !== "household" && (
                <div className="relative mt-4 border-t border-dashed border-[var(--kk-smoke)] pt-3">
                    {editTarget === "personal" ? (
                        <BudgetEditor
                            currencySymbol={currencySymbol}
                            placeholder="Enter your personal limit"
                            draft={budgetDraft}
                            setDraft={setBudgetDraft}
                            error={budgetError}
                            hasBudget={hasPersonalBudget}
                            onSave={handlePersonalSave}
                            onCancel={() => setEditTarget(null)}
                        />
                    ) : personalInHousehold ? (
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-xs text-[var(--kk-ash)]">
                                <span>Your limit: </span>
                                <span className="font-medium text-[var(--kk-ink)]">
                                    <span className="kk-currency">{currencySymbol}</span>
                                    {formatCurrency(personalInHousehold.amount)}
                                </span>
                                <span className="mx-1.5">&middot;</span>
                                <span className={personalInHousehold.overspend ? "text-[var(--kk-danger-ink)] font-medium" : ""}>
                                    <span className="kk-currency">{currencySymbol}</span>
                                    {formatCurrency(personalInHousehold.remaining)} left
                                </span>
                            </div>
                            {isCurrentMonth && (
                                <button
                                    type="button"
                                    onClick={() => openEditor("personal")}
                                    className="text-[10px] font-medium text-[var(--kk-ash)] hover:text-[var(--kk-ember)] transition-colors"
                                >
                                    Change
                                </button>
                            )}
                        </div>
                    ) : isCurrentMonth ? (
                        <button
                            type="button"
                            onClick={() => openEditor("personal")}
                            className="w-full text-left text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
                        >
                            + Set a personal limit
                        </button>
                    ) : null}
                </div>
            )}
        </div>
    );
});

BudgetCard.displayName = "BudgetCard";
