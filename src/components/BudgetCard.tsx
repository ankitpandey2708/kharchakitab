"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";

interface BudgetCardProps {
    currencySymbol: string;
    formatCurrency: (amount: number) => string;
    viewTotal: number;
}

export const BudgetCard = React.memo(({
    currencySymbol,
    formatCurrency,
    viewTotal,
}: BudgetCardProps) => {
    const [budgets, setBudgets] = useState<{
        monthly: number | null;
        coachmarkDismissedMonth?: string | null;
    }>({
        monthly: null,
        coachmarkDismissedMonth: null,
    });
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [budgetDraft, setBudgetDraft] = useState("");
    const [budgetError, setBudgetError] = useState<string | null>(null);
    const [coachmarkDismissed, setCoachmarkDismissed] = useState(false);

    const currentMonthKey = useMemo(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    }, []);

    useEffect(() => {
        const stored = window.localStorage.getItem("kk_budgets");
        if (!stored) return;
        try {
            const parsed = JSON.parse(stored) as Partial<typeof budgets> & {
                monthly?: number;
                coachmarkDismissedMonth?: string;
            };
            const nextBudgets = {
                monthly:
                    typeof parsed.monthly === "number" && parsed.monthly > 0
                        ? parsed.monthly
                        : null,
                coachmarkDismissedMonth:
                    typeof parsed.coachmarkDismissedMonth === "string"
                        ? parsed.coachmarkDismissedMonth
                        : null,
            };
            setBudgets(nextBudgets);
            setCoachmarkDismissed(nextBudgets.coachmarkDismissedMonth === currentMonthKey);
        } catch {
            setBudgets({ monthly: null, coachmarkDismissedMonth: null });
            setCoachmarkDismissed(false);
        }
    }, [currentMonthKey]);

    const activeBudget = budgets.monthly;
    const hasBudget = typeof activeBudget === "number" && activeBudget > 0;

    const { remaining, overspend, budgetPercent } = useMemo(() => {
        if (!hasBudget) {
            return { remaining: null, overspend: false, budgetPercent: 0 };
        }
        const raw = activeBudget - viewTotal;
        return {
            remaining: Math.max(raw, 0),
            overspend: raw < 0,
            budgetPercent: Math.min(viewTotal / activeBudget, 1),
        };
    }, [activeBudget, hasBudget, viewTotal]);

    const budgetLabel = "Monthly Budget";

    const resetHintLabel = useMemo(() => {
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1, 1);
        return `Resets on ${nextMonth.toLocaleDateString("en-IN", {
            month: "short",
            day: "2-digit",
        })}`;
    }, []);

    const coachmarkEligible =
        !hasBudget &&
        !isEditingBudget &&
        !coachmarkDismissed;

    const handleBudgetSave = useCallback(() => {
        if (budgetDraft.trim() === "") {
            setBudgetError("Enter a positive number");
            return;
        }
        const parsed = Number(budgetDraft);
        if (!Number.isFinite(parsed)) {
            setBudgetError("Enter a positive number");
            return;
        }
        setBudgetError(null);
        setBudgets((prev) => {
            const next = { ...prev, monthly: parsed === 0 ? null : parsed };
            window.localStorage.setItem("kk_budgets", JSON.stringify(next));
            return next;
        });
        setIsEditingBudget(false);
    }, [budgetDraft]);

    const openBudgetEditor = useCallback(() => {
        setBudgetError(null);
        setBudgetDraft(activeBudget ? String(activeBudget) : "");
        setIsEditingBudget(true);
    }, [activeBudget]);

    const dismissCoachmark = useCallback(() => {
        setCoachmarkDismissed(true);
        setBudgets((prev) => {
            const next = { ...prev, coachmarkDismissedMonth: currentMonthKey };
            window.localStorage.setItem("kk_budgets", JSON.stringify(next));
            return next;
        });
    }, [currentMonthKey]);

    // Coachmark state
    if (!hasBudget && !isEditingBudget && coachmarkEligible) {
        return (
            <div className="rounded-[var(--kk-radius-md)] border border-[var(--kk-ember)]/30 bg-[var(--kk-ember)]/[0.06] px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 text-center sm:text-left sm:pr-2">
                        <div className="truncate text-sm font-medium text-[var(--kk-ink)]">
                            Want a monthly budget?
                        </div>
                        <div className="kk-meta mt-0.5">See monthly progress and pace limits</div>
                    </div>
                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                        <button
                            type="button"
                            onClick={dismissCoachmark}
                            className="kk-btn-ghost kk-btn-compact w-full sm:w-auto"
                            aria-label="Dismiss budget nudge"
                            title="Dismiss"
                        >
                            Later
                        </button>
                        <button
                            type="button"
                            onClick={openBudgetEditor}
                            className="kk-btn-secondary kk-btn-compact w-full sm:w-auto"
                        >
                            Add
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Dismissed coachmark - ghost button
    if (!hasBudget && !isEditingBudget && coachmarkDismissed) {
        return (
            <button
                type="button"
                onClick={openBudgetEditor}
                className="w-full text-center text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors py-1"
            >
                + Set monthly budget
            </button>
        );
    }

    // Editing state or has budget
    return (
        <div className="relative overflow-hidden rounded-[var(--kk-radius-md)] bg-gradient-to-br from-white/80 to-[var(--kk-cream)]/60 p-5">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--kk-ember)]/5 to-transparent" />

            <div className="relative flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="kk-label">{budgetLabel}</div>
                    <div className="kk-meta mt-1">{resetHintLabel}</div>
                </div>
                <div className="flex-shrink-0">
                    {!isEditingBudget && hasBudget && (
                        <button
                            type="button"
                            onClick={openBudgetEditor}
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

            <div className="relative mt-4">
                {isEditingBudget ? (
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <span className="kk-pill bg-white">{currencySymbol}</span>
                            <input
                                type="number"
                                min="1"
                                inputMode="decimal"
                                placeholder={`Enter ${budgetLabel.toLowerCase()}`}
                                value={budgetDraft}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    if (next.trim().startsWith("-")) return;
                                    setBudgetDraft(next);
                                }}
                                className="kk-input h-9 text-sm flex-1"
                                autoFocus
                            />
                        </div>
                        {budgetError && (
                            <div className="kk-meta text-[var(--kk-ember)]">{budgetError}</div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsEditingBudget(false)}
                                className="kk-btn-secondary kk-btn-compact"
                            >
                                {hasBudget ? "Cancel" : "Close"}
                            </button>
                            <button
                                type="button"
                                onClick={handleBudgetSave}
                                className="kk-btn-primary kk-btn-compact"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : hasBudget ? (
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-1.5">
                                <span className="kk-meta">Remaining</span>
                            </div>
                            <div
                                className={`mt-0.5 text-xl font-semibold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ink)]"
                                    }`}
                            >
                                {overspend
                                    ? <span>-<span className="kk-currency">{currencySymbol}</span>{formatCurrency((activeBudget ?? 0) - (remaining ?? 0))}</span>
                                    : <span><span className="kk-currency">{currencySymbol}</span>{formatCurrency(remaining ?? 0)}</span>}
                            </div>
                            <div className="mt-2 text-xs text-[var(--kk-ash)]">
                                of <span className="font-medium text-[var(--kk-ink)]"><span className="kk-currency">{currencySymbol}</span>{formatCurrency(activeBudget ?? 0)}</span> total
                            </div>
                        </div>
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
                                    strokeDasharray={`${Math.max(Math.min(budgetPercent * 100, 100), budgetPercent > 0 ? 3 : 0)}, 100`}
                                    className="transition-all duration-500"
                                />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <span className={`text-xs font-bold font-[family:var(--font-mono)] ${overspend ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ember)]"}`}>
                                    {Math.round(budgetPercent * 100)}%
                                </span>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
});

BudgetCard.displayName = "BudgetCard";
