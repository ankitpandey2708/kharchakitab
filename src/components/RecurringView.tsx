"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  ChevronRight,
  Calendar,
  Pencil,
  Trash2,
  Clock,
  Repeat,
  Sparkles,
  Bell,
  TrendingUp,
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
    });
  }
  if (diffDays <= 7) return `In ${diffDays} days`;

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
};

// Get urgency level for visual treatment
const getUrgencyLevel = (dueAt: number, reminderDays: number): "urgent" | "soon" | "relaxed" => {
  const now = Date.now();
  const daysUntilDue = Math.ceil((dueAt - now) / (1000 * 60 * 60 * 24));

  if (daysUntilDue <= 1) return "urgent";
  if (daysUntilDue <= reminderDays) return "soon";
  return "relaxed";
};

// Calculate monthly commitment
const calculateMonthlyTotal = (templates: Recurring_template[]): number => {
  return templates.reduce((total, t) => {
    switch (t.recurring_frequency) {
      case "monthly": return total + t.amount;
      case "quarterly": return total + t.amount / 3;
      case "halfyearly": return total + t.amount / 6;
      case "yearly": return total + t.amount / 12;
      default: return total + t.amount;
    }
  }, 0);
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
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const usedTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const template of templates) {
      if (template.recurring_template_id) {
        ids.add(template.recurring_template_id);
      }
    }
    return ids;
  }, [templates]);

  const monthlyTotal = useMemo(() => calculateMonthlyTotal(templates), [templates]);

  const loadRecurring = useCallback(async () => {
    setIsLoading(true);
    try {
      const allTemplates = await getRecurringTemplates();
      const now = Date.now();
      const updates: Promise<unknown>[] = [];

      const normalized = allTemplates.map((template) => {
        const dueAt = template.recurring_next_due_at;

        if (dueAt < now && now <= template.recurring_end_date) {
          const nextDue = getNextUpcomingDueDate(
            dueAt,
            template.recurring_frequency,
            now,
            template.recurring_end_date
          );

          if (nextDue !== dueAt) {
            updates.push(
              updateRecurringTemplate(template._id, {
                recurring_next_due_at: nextDue,
              })
            );

            return { ...template, recurring_next_due_at: nextDue };
          }
        }

        return template;
      });

      if (updates.length > 0) {
        await Promise.allSettled(updates);
      }

      const active = normalized.filter((t) => now <= t.recurring_end_date);
      setTemplates(active);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring, refreshKey]);

  const dueSoonTemplates = useMemo(
    () =>
      templates.filter((template) => {
        const dueAt = template.recurring_next_due_at;
        const reminderDays = template.recurring_reminder_days ?? 5;
        return isDueSoon(dueAt, reminderDays);
      }),
    [templates]
  );

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

  const handleDelete = async (template: Recurring_template) => {
    if (!confirm(`Delete "${template.item}" recurring template?`)) return;

    await deleteRecurringTemplate(template._id);
    await loadRecurring();
  };

  // Stagger animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.95 },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 24,
      },
    },
    exit: {
      opacity: 0,
      y: -10,
      scale: 0.95,
      transition: { duration: 0.2 },
    },
  };

  const renderCard = (
    template: Recurring_template,
    showDueBadge = false,
    index = 0
  ) => {
    const CategoryIcon =
      CATEGORY_ICON_MAP[template.category as CategoryKey] ??
      CATEGORY_ICON_MAP.Other;
    const dueAt = template.recurring_next_due_at;
    const reminderDays = template.recurring_reminder_days ?? 5;
    const urgency = getUrgencyLevel(dueAt, reminderDays);
    const dueLabel = formatDueDate(dueAt);
    const isHovered = hoveredCard === template._id;

    // Urgency-based styling
    const urgencyStyles = {
      urgent: {
        border: "border-[var(--kk-danger)]/40",
        glow: "shadow-[0_0_24px_rgba(229,72,77,0.15)]",
        icon: "bg-[var(--kk-danger-bg)] text-[var(--kk-danger)]",
        badge: "bg-[var(--kk-danger-bg)] text-[var(--kk-danger-ink)]",
        dot: "bg-[var(--kk-danger)]",
      },
      soon: {
        border: "border-[var(--kk-saffron)]/40",
        glow: "shadow-[0_0_24px_rgba(247,201,72,0.15)]",
        icon: "bg-[var(--kk-saffron)]/10 text-[var(--kk-saffron)]",
        badge: "bg-[var(--kk-saffron)]/12 text-[#856404]",
        dot: "bg-[var(--kk-saffron)]",
      },
      relaxed: {
        border: "border-[var(--kk-smoke)]",
        glow: "",
        icon: "bg-[var(--kk-cream)] text-[var(--kk-ash)]",
        badge: "bg-[var(--kk-smoke)] text-[var(--kk-ash)]",
        dot: "bg-[var(--kk-sage)]",
      },
    };

    const style = urgencyStyles[urgency];

    return (
      <motion.div
        key={template._id}
        variants={cardVariants}
        layout
        onMouseEnter={() => setHoveredCard(template._id)}
        onMouseLeave={() => setHoveredCard(null)}
        className={`
          group relative overflow-hidden rounded-2xl border bg-white/80 backdrop-blur-sm
          transition-all duration-300 ease-out
          ${style.border} ${isHovered ? style.glow : ""}
          hover:border-[var(--kk-ember)]/30 hover:shadow-lg
        `}
      >
        {/* Decorative rhythm lines - visualizing recurring nature */}
        <div className="absolute -right-4 -top-4 opacity-[0.03]">
          <Repeat className="h-24 w-24 text-[var(--kk-ink)]" />
        </div>

        {/* Urgency indicator bar */}
        {urgency !== "relaxed" && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            className={`absolute left-0 top-0 h-1 w-full origin-left ${urgency === "urgent"
              ? "bg-gradient-to-r from-[var(--kk-danger)] to-[var(--kk-ember)]"
              : "bg-gradient-to-r from-[var(--kk-saffron)] to-[var(--kk-ember-glow)]"
              }`}
          />
        )}

        <div className="relative p-5">
          <div className="flex items-start gap-4">
            {/* Category Icon with pulse animation for urgent items */}
            <div className="relative">
              <motion.div
                animate={urgency === "urgent" ? { scale: [1, 1.05, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
                className={`
                  flex h-12 w-12 items-center justify-center rounded-xl
                  transition-all duration-300
                  ${style.icon}
                  ${isHovered ? "scale-110 rotate-3" : ""}
                `}
              >
                <CategoryIcon className="h-5 w-5" />
              </motion.div>
              {/* Status dot */}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${style.dot}`} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-[var(--kk-ink)] truncate text-base">
                    {template.item}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                    {/* Frequency pill */}
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--kk-cream)] px-2.5 py-1 font-medium text-[var(--kk-ash)]">
                      <Clock className="h-3 w-3" />
                      {FREQUENCY_LABEL_MAP[template.recurring_frequency]}
                    </span>

                    {/* Due date badge */}
                    {showDueBadge && (
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold ${style.badge}`}>
                        <Calendar className="h-3 w-3" />
                        {urgency === "urgent" ? "Due " : ""}{dueLabel}
                      </span>
                    )}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <div className="font-[family:var(--font-display)] text-xl font-bold text-[var(--kk-ink)]">
                    <span className="text-[var(--kk-ember)]">₹</span>
                    <span className="font-[family:var(--font-mono)]">{formatCurrency(template.amount)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--kk-ash)]">
                    per {template.recurring_frequency.replace("ly", "")}
                  </div>
                </div>
              </div>

              {/* Action buttons - slide in on hover */}
              <motion.div
                initial={false}
                animate={{
                  opacity: isHovered ? 1 : 0,
                  y: isHovered ? 0 : 8,
                }}
                transition={{ duration: 0.2 }}
                className="mt-4 flex flex-wrap items-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => onEditRecurring(template)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kk-smoke-heavy)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--kk-ink)] transition-all hover:border-[var(--kk-ember)] hover:text-[var(--kk-ember)]"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(template)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--kk-smoke-heavy)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--kk-ash)] transition-all hover:border-[var(--kk-danger)] hover:bg-[var(--kk-danger-bg)] hover:text-[var(--kk-danger-ink)]"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </motion.div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  const renderTemplateCard = (template: RecurringTemplate) => {
    if (usedTemplateIds.has(template.id)) {
      return null;
    }
    const Icon = template.icon;
    return (
      <motion.button
        key={template.id}
        type="button"
        whileHover={{ scale: 1.02, y: -2 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => onAddRecurring(template)}
        className="group flex items-center gap-3 rounded-xl border border-[var(--kk-smoke)] bg-white/60 p-3.5 text-left transition-all hover:border-[var(--kk-ember)]/40 hover:bg-white hover:shadow-md"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--kk-cream)] text-[var(--kk-ash)] transition-all group-hover:bg-[var(--kk-ember)]/10 group-hover:text-[var(--kk-ember)]">
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--kk-ink)] truncate">
            {template.name}
          </div>
          <div className="text-xs text-[var(--kk-ash)] mt-0.5">
            {FREQUENCY_LABEL_MAP[template.suggestedFrequency]}
          </div>
        </div>
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ash)] transition-all group-hover:bg-[var(--kk-ember)] group-hover:text-white">
          <Plus className="h-4 w-4" />
        </div>
      </motion.button>
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="relative"
        >
          <div className="h-12 w-12 rounded-full border-3 border-[var(--kk-smoke)] border-t-[var(--kk-ember)]" />
          <Repeat className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-[var(--kk-ember)]" />
        </motion.div>
        <span className="text-sm text-[var(--kk-ash)]">Loading recurring expenses...</span>
      </div>
    );
  }

  // Empty state
  if (templates.length === 0 && !showTemplates) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-8"
      >
        <EmptyState
          icon={<Repeat className="h-8 w-8 text-[var(--kk-ash)]" />}
          title="No recurring expenses yet"
          subtitle="Set up recurring expenses to track subscriptions, bills, and more"
          className="py-12"
        />
      </motion.div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Header - Only show if there are active templates */}
      {templates.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white via-white to-[var(--kk-cream)]/50 p-6">
          {/* Decorative elements */}
          <div className="absolute -right-8 -top-8 opacity-[0.04]">
            <TrendingUp className="h-40 w-40 text-[var(--kk-ink)]" />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--kk-ember)]/10 text-[var(--kk-ember)]">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--kk-ash)]">
                    Monthly Commitment
                  </div>
                  <div className="font-[family:var(--font-display)] text-2xl font-bold text-[var(--kk-ink)]">
                    <span className="text-[var(--kk-ember)]">₹</span>
                    <span className="font-[family:var(--font-mono)]">{formatCurrency(monthlyTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex flex-col items-center rounded-xl bg-[var(--kk-cream)] px-4 py-2">
                <span className="font-[family:var(--font-mono)] text-xl font-bold text-[var(--kk-ink)]">{templates.length}</span>
                <span className="text-xs text-[var(--kk-ash)]">Active</span>
              </div>
              {dueSoonTemplates.length > 0 && (
                <div className="flex flex-col items-center rounded-xl bg-[var(--kk-saffron)]/10 px-4 py-2">
                  <span className="font-[family:var(--font-mono)] text-xl font-bold text-[var(--kk-saffron)]">{dueSoonTemplates.length}</span>
                  <span className="text-xs text-[var(--kk-ash)]">Due Soon</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Due Soon Section */}
      {dueSoonTemplates.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--kk-saffron)]/15">
                <Bell className="h-4 w-4 text-[var(--kk-saffron)]" />
              </div>
              <h2 className="font-[family:var(--font-display)] text-lg font-semibold text-[var(--kk-ink)]">
                Due Soon
              </h2>
            </div>
            <div className="flex-1 border-t border-dashed border-[var(--kk-saffron)]/30" />
            <span className="rounded-full bg-[var(--kk-saffron)]/10 px-2.5 py-0.5 text-xs font-bold text-[var(--kk-saffron)]">
              {dueSoonTemplates.length}
            </span>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4"
          >
            <AnimatePresence mode="popLayout">
              {dueSoonTemplates.map((template, i) => renderCard(template, true, i))}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}

      {/* All Recurring Section */}
      {upcomingTemplates.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--kk-sage-bg)]">
                <Repeat className="h-4 w-4 text-[var(--kk-sage)]" />
              </div>
              <h2 className="font-[family:var(--font-display)] text-lg font-semibold text-[var(--kk-ink)]">
                All Recurring
              </h2>
            </div>
            <div className="flex-1 border-t border-dashed border-[var(--kk-smoke-heavy)]" />
            <span className="rounded-full bg-[var(--kk-smoke)] px-2.5 py-0.5 text-xs font-bold text-[var(--kk-ash)]">
              {upcomingTemplates.length}
            </span>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid gap-4"
          >
            <AnimatePresence mode="popLayout">
              {upcomingTemplates.map((template, i) => renderCard(template, true, i))}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}

      {/* Templates Section */}
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white to-[var(--kk-cream)]/30 p-5 sm:p-6"
      >
        {/* Decorative sparkles */}
        <div className="absolute right-6 top-6 opacity-[0.06]">
          <Sparkles className="h-16 w-16 text-[var(--kk-ember)]" />
        </div>

        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--kk-ember)] to-[var(--kk-ember-deep)] text-white shadow-lg shadow-[var(--kk-ember)]/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-[family:var(--font-display)] text-lg font-semibold text-[var(--kk-ink)]">
                Quick Templates
              </h2>
              <p className="text-sm text-[var(--kk-ash)]">
                Start quickly with common recurring expenses
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowTemplates((prev) => !prev)}
            className="rounded-full border border-[var(--kk-smoke-heavy)] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[var(--kk-ash)] transition-all hover:border-[var(--kk-ink)] hover:text-[var(--kk-ink)]"
          >
            {showTemplates ? "Hide" : "Show"}
          </button>
        </div>

        <AnimatePresence>
          {showTemplates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-6 space-y-5"
            >
              {TEMPLATE_GROUPS.map((group) => {
                const groupTemplates = RECURRING_TEMPLATES.filter(
                  (t) => t.group === group.key
                );
                const isOpen = expandedGroups.has(group.key);
                const visibleTemplates = groupTemplates.filter(t => !usedTemplateIds.has(t.id));

                if (visibleTemplates.length === 0) return null;

                return (
                  <div key={group.key} className="space-y-3">
                    <motion.button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      whileTap={{ scale: 0.99 }}
                      className="flex w-full items-center justify-between rounded-xl border border-[var(--kk-smoke)] bg-white/80 px-4 py-3 text-left transition-all hover:border-[var(--kk-ember)]/30 hover:shadow-sm"
                    >
                      <div>
                        <div className="text-sm font-semibold text-[var(--kk-ink)]">
                          {group.label}
                        </div>
                        <div className="text-xs text-[var(--kk-ash)] mt-0.5">
                          {group.description}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--kk-cream)] px-2 py-0.5 text-xs font-bold text-[var(--kk-ash)]">
                          {visibleTemplates.length}
                        </span>
                        <motion.div
                          animate={{ rotate: isOpen ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <ChevronDown className="h-4 w-4 text-[var(--kk-ash)]" />
                        </motion.div>
                      </div>
                    </motion.button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="grid gap-3 sm:grid-cols-2 overflow-hidden"
                        >
                          {visibleTemplates.map((template) => renderTemplateCard(template))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </div>
  );
};
