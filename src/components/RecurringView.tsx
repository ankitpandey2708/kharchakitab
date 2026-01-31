"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import {
  RECURRING_TEMPLATES,
  TEMPLATE_GROUPS,
  FREQUENCY_LABEL_MAP,
  calculateNextDueDate,
  isDueSoon,
  isOverdue,
  type TemplateGroup,
  type RecurringTemplate,
} from "@/src/config/recurring";
import { CATEGORY_ICON_MAP, type CategoryKey } from "@/src/config/categories";
import { deleteTransaction, getPersonalTransactions, updateTransaction } from "@/src/db/db";
import type { Transaction } from "@/src/types";
import { formatCurrency } from "@/src/utils/money";
import { EmptyState } from "@/src/components/EmptyState";

interface RecurringViewProps {
  refreshKey: number;
  onAddRecurring: (template?: RecurringTemplate) => void;
  onEditRecurring: (tx: Transaction) => void;
}

const formatDueDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

  const diffDays = Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  if (diffDays <= 7) return `In ${diffDays} days`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

const isRecurringTransaction = (tx: Transaction) =>
  Boolean(
    tx.recurring &&
      tx.recurring_frequency &&
      tx.recurring_start_date &&
      tx.recurring_end_date
  );

const isActiveRecurring = (tx: Transaction) =>
  isRecurringTransaction(tx) &&
  Date.now() <= (tx.recurring_end_date ?? 0);

export const RecurringView = ({
  refreshKey,
  onAddRecurring,
  onEditRecurring,
}: RecurringViewProps) => {
  const [recurringItems, setRecurringItems] = useState<Transaction[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<TemplateGroup>>(
    new Set(["utilities", "subscriptions"])
  );
  const [showTemplates, setShowTemplates] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const loadRecurring = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await getPersonalTransactions();
      const active = all.filter(isActiveRecurring);
      setRecurringItems(active);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring, refreshKey]);

  const dueSoonItems = useMemo(
    () =>
      recurringItems.filter((tx) => {
        const reminder = tx.recurring_reminder_days ?? 5;
        return isDueSoon(tx.timestamp, reminder);
      }),
    [recurringItems]
  );

  const upcomingItems = useMemo(
    () =>
      recurringItems.filter(
        (tx) => !dueSoonItems.some((due) => due.id === tx.id)
      ),
    [dueSoonItems, recurringItems]
  );

  const toggleGroup = (group: TemplateGroup) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  const handleMarkAsPaid = async (tx: Transaction) => {
    if (!tx.recurring_frequency) return;
    if (tx.timestamp <= Date.now()) return;
    const nextDue = calculateNextDueDate(tx.timestamp, tx.recurring_frequency);
    await updateTransaction(tx.id, {
      timestamp: nextDue,
      recurring_last_paid_at: Date.now(),
    });
    await loadRecurring();
  };

  const handleDelete = async (tx: Transaction) => {
    await deleteTransaction(tx.id);
    await loadRecurring();
  };

  const renderCard = (tx: Transaction, showDueStatus = false) => {
    const CategoryIcon = CATEGORY_ICON_MAP[tx.category as CategoryKey] ?? CATEGORY_ICON_MAP.Other;
    const overdue = isOverdue(tx.timestamp);
    const dueSoon = isDueSoon(tx.timestamp, tx.recurring_reminder_days ?? 5);
    const canMarkPaid = tx.timestamp > Date.now();

    return (
      <motion.div
        key={tx.id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`kk-card p-4 ${overdue ? "border-[var(--kk-danger-ink)]/30" : dueSoon ? "border-[var(--kk-saffron)]/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              overdue
                ? "bg-[var(--kk-danger-ink)]/10 text-[var(--kk-danger-ink)]"
                : dueSoon
                ? "bg-[var(--kk-saffron)]/10 text-[var(--kk-saffron)]"
                : "bg-[var(--kk-cream)] text-[var(--kk-ash)]"
            }`}
          >
            <CategoryIcon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-[var(--kk-ink)] truncate">
                {tx.item}
              </div>
              <div className="font-semibold text-[var(--kk-ink)] font-[family:var(--font-mono)]">
                ₹{formatCurrency(tx.amount)}
              </div>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--kk-ash)]">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {FREQUENCY_LABEL_MAP[tx.recurring_frequency ?? "monthly"]}
              </span>
              {showDueStatus && (
                <span
                  className={`flex items-center gap-1 ${
                    overdue
                      ? "text-[var(--kk-danger-ink)] font-medium"
                      : dueSoon
                      ? "text-[var(--kk-saffron)] font-medium"
                      : ""
                  }`}
                >
                  <Calendar className="h-3 w-3" />
                  {formatDueDate(tx.timestamp)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEditRecurring(tx)}
            className="kk-btn-secondary kk-btn-compact"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDelete(tx)}
            className="kk-btn-secondary kk-btn-compact"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          {canMarkPaid && (
            <button
              type="button"
              onClick={() => handleMarkAsPaid(tx)}
              className="kk-btn-primary kk-btn-compact"
            >
              <Check className="h-3.5 w-3.5" />
              Mark as Paid
            </button>
          )}
        </div>
      </motion.div>
    );
  };

  const renderTemplateCard = (template: RecurringTemplate) => {
    const Icon = template.icon;
    return (
      <button
        key={template.id}
        type="button"
        onClick={() => onAddRecurring(template)}
        className="flex items-center gap-3 rounded-xl border border-[var(--kk-smoke)] bg-white p-3 text-left transition hover:border-[var(--kk-ember)] hover:bg-[var(--kk-ember)]/5 active:scale-[0.98]"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ash)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-[var(--kk-ink)] truncate">
            {template.name}
          </div>
          <div className="text-xs text-[var(--kk-ash)]">
            {FREQUENCY_LABEL_MAP[template.suggestedFrequency]}
          </div>
        </div>
        <Plus className="h-4 w-4 text-[var(--kk-ash)]" />
      </button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--kk-ember)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="kk-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="kk-label">Recurring</div>
            <div className="text-sm text-[var(--kk-ash)]">
              Create and manage scheduled expenses
            </div>
          </div>
          <button
            type="button"
            onClick={() => onAddRecurring()}
            className="kk-btn-primary kk-btn-compact"
          >
            <Plus className="h-4 w-4" />
            Add recurring
          </button>
        </div>
      </div>

      {recurringItems.length === 0 && (
        <EmptyState
          icon={<AlertCircle className="h-8 w-8 text-[var(--kk-ash)]" />}
          title="No recurring expenses yet"
          subtitle="Start with a template or add one manually."
          className="kk-card py-10"
        />
      )}

      {dueSoonItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="kk-label text-[var(--kk-saffron)]">Due Soon</div>
            <div className="flex-1 border-t border-[var(--kk-smoke)]" />
          </div>
          <AnimatePresence>{dueSoonItems.map((tx) => renderCard(tx, true))}</AnimatePresence>
        </div>
      )}

      {upcomingItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="kk-label">All recurring</div>
            <div className="flex-1 border-t border-[var(--kk-smoke)]" />
          </div>
          <AnimatePresence>{upcomingItems.map((tx) => renderCard(tx, true))}</AnimatePresence>
        </div>
      )}

      <div className="kk-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="kk-label">Templates</div>
            <div className="text-sm text-[var(--kk-ash)]">
              Start quickly with common recurring expenses
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTemplates((prev) => !prev)}
            className="kk-btn-ghost kk-btn-compact"
          >
            {showTemplates ? "Hide" : "Show"}
          </button>
        </div>

        {showTemplates && (
          <div className="mt-4 space-y-4">
            {TEMPLATE_GROUPS.map((group) => {
              const templates = RECURRING_TEMPLATES.filter((t) => t.group === group.key);
              const isOpen = expandedGroups.has(group.key);
              return (
                <div key={group.key} className="space-y-3">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    className="flex w-full items-center justify-between rounded-lg border border-[var(--kk-smoke)] bg-white/60 px-3 py-2 text-left"
                  >
                    <div>
                      <div className="text-sm font-medium text-[var(--kk-ink)]">
                        {group.label}
                      </div>
                      <div className="text-xs text-[var(--kk-ash)]">
                        {group.description}
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-[var(--kk-ash)]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--kk-ash)]" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {templates.map((template) => renderTemplateCard(template))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
