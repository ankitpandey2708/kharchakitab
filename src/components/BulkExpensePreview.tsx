"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, RefreshCw } from "lucide-react";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import type { Expense } from "@/src/utils/schemas";

interface BulkExpensePreviewProps {
  expenses: Expense[];
  currencySymbol: string;
  onSave: (expenses: Expense[]) => void;
  onCancel: () => void;
}

export const BulkExpensePreview = React.memo(({
  expenses,
  currencySymbol,
  onSave,
  onCancel,
}: BulkExpensePreviewProps) => {
  const [items, setItems] = useState<Expense[]>(expenses);

  const remove = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, e) => sum + e.amount, 0);
  const recurringCount = items.filter((e) => e.recurring).length;
  const nonRecurringCount = items.length - recurringCount;

  return (
    <AnimatePresence>
      <motion.div
        key="bulk-overlay"
        className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--kk-void)]/40 backdrop-blur-sm transform-gpu will-change-[opacity]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0"
          onClick={onCancel}
        />

        {/* Sheet */}
        <motion.div
          className="relative w-full max-w-md overflow-hidden kk-radius-top-xl border border-[var(--kk-smoke)] bg-[var(--kk-cream)] max-h-[85vh] flex flex-col"
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
        >
          {/* Handle bar */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
          </div>

          <div className="px-5 pb-5 flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--kk-ash)]">
                  Bulk Add
                </div>
                <div className="mt-1 text-2xl font-semibold font-[family:var(--font-display)] text-[var(--kk-ink)]">
                  {items.length} expense{items.length !== 1 ? "s" : ""} found
                </div>
                <div className="mt-1 text-xs text-[var(--kk-ash)]">
                  {recurringCount > 0 && nonRecurringCount > 0
                    ? `${nonRecurringCount} one-time, ${recurringCount} recurring`
                    : recurringCount > 0
                      ? "All recurring"
                      : "Review and confirm"
                  }
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                className="kk-icon-btn mt-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Expense list */}
            <div className="mt-4 flex-1 min-h-0 overflow-y-auto -mx-5 px-5 space-y-2">
              <AnimatePresence initial={false}>
                {items.map((expense, i) => {
                  return (
                    <motion.div
                      key={`${expense.item}-${expense.amount}-${i}`}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
                      transition={{ duration: 0.22, delay: i * 0.03 }}
                      className="flex items-center gap-3 kk-radius-md border border-[var(--kk-smoke)] bg-white p-3 transform-gpu will-change-transform"
                    >
                      {/* Category icon */}
                      <div className="kk-category-icon h-9 w-9 flex-none shrink-0">
                        <CategoryIcon category={expense.category} className="h-4 w-4" />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-[var(--kk-ink)]">
                          {expense.item}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 kk-meta flex-nowrap overflow-hidden">
                          <span>{expense.category}</span>
                          {expense.recurring && (
                            <span className="kk-pill" style={{ background: "var(--kk-ocean-bg)", borderColor: "rgba(62,99,221,0.15)", color: "var(--kk-ocean)" }}>
                              <RefreshCw className="h-3 w-3" />
                              {expense.frequency ?? "recurring"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="kk-amount text-right shrink-0">
                        <span className="kk-currency">{currencySymbol}</span>
                        {expense.amount.toLocaleString()}
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm flex-none"
                        aria-label={`Remove ${expense.item}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Total bar */}
            {items.length > 0 && (
              <div className="mt-4 flex items-center justify-between kk-radius-md border border-[var(--kk-smoke)] bg-white px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                  Total
                </span>
                <span className="kk-amount text-lg">
                  <span className="kk-currency">{currencySymbol}</span>
                  {total.toLocaleString()}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="kk-btn-secondary flex-1 py-3"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSave(items)}
                disabled={items.length === 0}
                className="kk-btn-primary flex-[2] py-3"
              >
                Save {items.length} expense{items.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

BulkExpensePreview.displayName = "BulkExpensePreview";
