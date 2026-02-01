"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  AlertCircle,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import {
  RECURRING_TEMPLATES,
  TEMPLATE_GROUPS,
  FREQUENCY_LABEL_MAP,
  getNextUpcomingDueDate,
  isDueSoon,
  type TemplateGroup,
  type RecurringTemplate,
} from "@/src/config/recurring";
import { CATEGORY_ICON_MAP, type CategoryKey } from "@/src/config/categories";
import {
  getRecurringTemplates,
  deleteRecurringTemplate,
  updateRecurringTemplate,
} from "@/src/db/db";
import type { Recurring_template } from "@/src/types";
import { formatCurrency } from "@/src/utils/money";
import { EmptyState } from "@/src/components/EmptyState";

interface RecurringViewProps {
  refreshKey: number;
  onAddRecurring: (template?: RecurringTemplate) => void;
  onEditRecurring: (template: Recurring_template) => void;
}

const formatDueDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";

  const diffDays = Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (diffDays <= 7) return `In ${diffDays} days`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const RecurringView = ({
  refreshKey,
  onAddRecurring,
  onEditRecurring,
}: RecurringViewProps) => {
  const [templates, setTemplates] = useState<Recurring_template[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<TemplateGroup>>(
    new Set(["subscriptions"])
  );
  const [showTemplates, setShowTemplates] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const usedTemplateItems = useMemo(() => {
    const items = new Set<string>();
    for (const template of templates) {
      if (template.item) {
        items.add(template.item.trim().toLowerCase());
      }
    }
    return items;
  }, [templates]);

  const loadRecurring = useCallback(async () => {
    setIsLoading(true);
    try {
      const allTemplates = await getRecurringTemplates();
      const now = Date.now();
      const updates: Promise<unknown>[] = [];

      // Normalize stale next_due_at values
      const normalized = allTemplates.map((template) => {
        const dueAt = template.recurring_next_due_at;

        // If next_due_at is in the past, recalculate
        if (dueAt < now && now <= template.recurring_end_date) {
          const nextDue = getNextUpcomingDueDate(
            dueAt,
            template.recurring_frequency,
            now,
            template.recurring_end_date
          );

          if (nextDue !== dueAt) {
            console.info("[recurring:normalize] next-due-updated", {
              id: template._id,
              item: template.item,
              previousDue: dueAt,
              nextDue,
              frequency: template.recurring_frequency,
            });

            // Update in database
            updates.push(
              updateRecurringTemplate(template._id, {
                recurring_next_due_at: nextDue,
              })
            );

            // Return normalized template for immediate UI display
            return { ...template, recurring_next_due_at: nextDue };
          }
        }

        return template;
      });

      // Persist updates to database
      if (updates.length > 0) {
        await Promise.allSettled(updates);
      }

      // Filter out expired templates
      const active = normalized.filter((t) => now <= t.recurring_end_date);
      setTemplates(active);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring, refreshKey]);

  // Due Soon: Templates where next payment is within reminder window
  const dueSoonTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const dueAt = template.recurring_next_due_at;
        const reminderDays = template.recurring_reminder_days ?? 5;
        return isDueSoon(dueAt, reminderDays);
      }),
    [templates]
  );

  // Upcoming: All other active templates
  const upcomingTemplates = useMemo(
    () =>
      templates.filter(
        (template) => !dueSoonTemplates.some((due) => due._id === template._id)
      ),
    [dueSoonTemplates, templates]
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

  // COMMENTED OUT: Mark as Paid functionality (will be added later)
  // const handleMarkAsPaid = async (template: Recurring_template) => {
  //   // Future implementation
  // };

  const handleDelete = async (template: Recurring_template) => {
    if (!confirm(`Delete "${template.item}" recurring template?`)) return;

    await deleteRecurringTemplate(template._id);
    await loadRecurring();
  };

  const renderCard = (
    template: Recurring_template,
    showDueBadge = false
  ) => {
    const CategoryIcon =
      CATEGORY_ICON_MAP[template.category as CategoryKey] ??
      CATEGORY_ICON_MAP.Other;
    const dueAt = template.recurring_next_due_at;
    const dueSoon = isDueSoon(dueAt, template.recurring_reminder_days ?? 5);
    const dueLabel = formatDueDate(dueAt);
    const dueCopy = `Due ${dueLabel}`;

    return (
      <motion.div
        key={template._id}
        layout
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`kk-card p-4 ${dueSoon ? "border-[var(--kk-saffron)]/50" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-full ${dueSoon
                ? "bg-[var(--kk-saffron)]/10 text-[var(--kk-saffron)]"
                : "bg-[var(--kk-cream)] text-[var(--kk-ash)]"
              }`}
          >
            <CategoryIcon className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-[var(--kk-ink)] truncate">
                {template.item}
              </div>
              <div className="font-semibold text-[var(--kk-ink)] font-[family:var(--font-mono)]">
                ₹{formatCurrency(template.amount)}
              </div>
            </div>

            <div className="mt-1 flex items-center gap-3 text-xs text-[var(--kk-ash)]">
              <span className="flex min-w-[4rem] items-center gap-1">
                <Clock className="h-3 w-3" />
                {FREQUENCY_LABEL_MAP[template.recurring_frequency]}
              </span>
              {showDueBadge && (
                <span
                  className={`flex min-w-[4rem] items-center gap-1 ${dueSoon
                      ? "text-[var(--kk-saffron)] font-medium"
                      : ""
                    }`}
                >
                  <Calendar className="h-3 w-3" />
                  {dueCopy}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onEditRecurring(template)}
            className="kk-btn-secondary kk-btn-compact"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={() => handleDelete(template)}
            className="kk-btn-secondary kk-btn-compact"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
          {/* COMMENTED OUT: Mark as Paid button (will be added later)
          {showMarkPaid && (
            <button
              type="button"
              onClick={() => handleMarkAsPaid(template)}
              className="kk-btn-primary kk-btn-compact"
            >
              <Check className="h-3.5 w-3.5" />
              Mark as Paid
            </button>
          )}
          */}
        </div>
      </motion.div>
    );
  };

  const renderTemplateCard = (template: RecurringTemplate) => {
    if (usedTemplateItems.has(template.name.trim().toLowerCase())) {
      return null;
    }
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
      {/* Due Soon Section */}
      {dueSoonTemplates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="kk-label text-[var(--kk-saffron)]">Due Soon</div>
            <div className="flex-1 border-t border-[var(--kk-smoke)]" />
          </div>
          <AnimatePresence>
            {dueSoonTemplates.map((template) => renderCard(template, true))}
          </AnimatePresence>
        </div>
      )}

      {/* All Recurring Section */}
      {upcomingTemplates.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="kk-label">All Recurring</div>
            <div className="flex-1 border-t border-[var(--kk-smoke)]" />
          </div>
          <AnimatePresence>
            {upcomingTemplates.map((template) => renderCard(template, true))}
          </AnimatePresence>
        </div>
      )}

      {/* Templates Section */}
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
              const groupTemplates = RECURRING_TEMPLATES.filter(
                (t) => t.group === group.key
              );
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
                      {groupTemplates
                        .map((template) => renderTemplateCard(template))
                        .filter(Boolean)}
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
