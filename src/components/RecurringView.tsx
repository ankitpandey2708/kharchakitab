"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  ChevronDown,
  Calendar,
  CalendarPlus,
  Check,
  Pencil,
  Trash2,
  Clock,
  Repeat,
  Sparkles,
  TrendingUp,
  MoreHorizontal,
  Bell,
  BellOff,
  BellRing,
  ShieldAlert,
  Smartphone,
  Download,
  Globe,
} from "lucide-react";
import { downloadICS, openGoogleCalendar, toICSFilename } from "@/src/utils/ics";
import {
  RECURRING_TEMPLATES,
  TEMPLATE_GROUPS,
  FREQUENCY_LABEL_MAP,
  getNextUpcomingDueDate,
  isDueSoon,
  type TemplateGroup,
  type RecurringTemplate,
} from "@/src/config/recurring";
import {
  getRecurringTemplates,
  deleteRecurringTemplate,
  updateRecurringTemplate,
} from "@/src/db/db";
import type { Recurring_template } from "@/src/types";
import { formatCurrency } from "@/src/utils/money";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import {
  clearAlertsQueue,
  getAlertsEnabled,
  getAlertsEnvironment,
  getAlertsLastSyncAt,
  getAlertsStatus,
  isAlertsReady,
  requestNotificationPermission,
  sendTestNotification,
  setAlertsEnabled as persistAlertsEnabled,
  syncAlertsQueue,
} from "@/src/services/pwaAlerts";

interface RecurringViewProps {
  refreshKey: number;
  onAddRecurring: (template?: RecurringTemplate) => void;
  onEditRecurring: (template: Recurring_template) => void;
  onReactivateRecurring?: (template: Recurring_template) => void;
  onMobileSheetChange?: (isOpen: boolean) => void;
}

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

const formatDueDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.toDateString() === today.toDateString()) return "Due Today";
  if (date.toDateString() === tomorrow.toDateString()) return "Due Tomorrow";

  const diffDays = Math.ceil((timestamp - Date.now()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) {
    return `Due ${date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    })}`;
  }
  if (diffDays <= 7) return `Due in ${diffDays} days`;

  return `Next: ${date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })}`;
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
    if (t.recurring_amortize && t.recurring_frequency !== "monthly") {
      const periods = t.recurring_frequency === "yearly" ? 12 : 3;
      return total + Math.floor((t.amount / periods) * 100) / 100;
    }
    switch (t.recurring_frequency) {
      case "monthly": return total + t.amount;
      case "quarterly": return total + t.amount / 3;
      case "yearly": return total + t.amount / 12;
      default: return total + t.amount;
    }
  }, 0);
};

// ─── CalendarPickerPopover ───────────────────────────────────────────────────
// Portal-rendered popover + backdrop, escaping overflow:hidden and stacking contexts.
function CalendarPickerPopover({
  anchorEl,
  onClose,
  onGoogleCalendar,
  onDownloadICS,
}: {
  anchorEl: HTMLElement;
  onClose: () => void;
  onGoogleCalendar: () => void;
  onDownloadICS: () => void;
}) {
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    const rect = anchorEl.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }, [anchorEl]);

  if (!coords) return null;

  return createPortal(
    <>
      {/* Invisible full-screen backdrop to catch outside clicks */}
      <div
        className="fixed inset-0"
        style={{ zIndex: 9998 }}
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: -6 }}
        transition={{ type: "spring", stiffness: 400, damping: 26 }}
        style={{ position: "fixed", top: coords.top, right: coords.right, zIndex: 9999 }}
        className="w-52 overflow-hidden rounded-xl border border-[var(--kk-smoke)] bg-white shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_8px_-2px_rgba(0,0,0,0.06)]"
      >
        <div className="p-1">
          <button
            type="button"
            className="group/cal flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--kk-ink)] transition-all hover:bg-[var(--kk-ember)]/8"
            onClick={onGoogleCalendar}
          >
            <Globe className="h-4 w-4 text-[var(--kk-ash)] transition-colors group-hover/cal:text-[var(--kk-ember)]" />
            Google Calendar
          </button>
          <div className="mx-3 border-t border-[var(--kk-smoke)]" />
          <button
            type="button"
            className="group/ics flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--kk-ink)] transition-all hover:bg-[var(--kk-ember)]/8"
            onClick={onDownloadICS}
          >
            <Download className="h-4 w-4 text-[var(--kk-ash)] transition-colors group-hover/ics:text-[var(--kk-ember)]" />
            Download .ics
          </button>
        </div>
      </motion.div>
    </>,
    document.body
  );
}

export const RecurringView = React.memo(({
  refreshKey,
  onAddRecurring,
  onEditRecurring,
  onReactivateRecurring,
  onMobileSheetChange,
}: RecurringViewProps) => {
  const [templates, setTemplates] = useState<Recurring_template[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<TemplateGroup>>(
    new Set(["subscriptions"])
  );
  const [isLoading, setIsLoading] = useState(true);
  const [actionSheetTemplate, setActionSheetTemplate] = useState<Recurring_template | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [recurringFilter, setRecurringFilter] = useState<"active" | "ended" | "all">("active");
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [alertsEnv, setAlertsEnv] = useState(() => getAlertsEnvironment());
  const [alertsStatus, setAlertsStatus] = useState(() =>
    getAlertsStatus(false, getAlertsEnvironment())
  );
  const [alertsBusy, setAlertsBusy] = useState(false);
  const [alertsLastSync, setAlertsLastSync] = useState<number | null>(null);
  const [calendarPicker, setCalendarPicker] = useState<{ templateId: string; anchorEl: HTMLElement } | null>(null);

  const usedTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const template of templates) {
      if (template.recurring_template_id) {
        ids.add(template.recurring_template_id);
      }
    }
    return ids;
  }, [templates]);

  const now = useMemo(() => Date.now(), [templates]);
  const activeTemplates = useMemo(
    () => templates.filter((t) => now <= t.recurring_end_date),
    [templates, now]
  );
  const endedTemplates = useMemo(
    () => templates.filter((t) => now > t.recurring_end_date),
    [templates, now]
  );
  const monthlyTotal = useMemo(() => calculateMonthlyTotal(activeTemplates), [activeTemplates]);
  const alertsLabel = (() => {
    if (!alertsEnabled) return "Disabled";
    if (alertsEnv.isIos && !alertsEnv.isStandalone) return "Install required";
    if (alertsEnv.permission === "denied") return "Blocked";
    if (alertsEnv.permission === "default") return "Needs permission";
    return "Enabled";
  })();
  const alertsTone =
    alertsLabel === "Enabled"
      ? "bg-[var(--kk-sage-bg)] text-[var(--kk-sage)]"
      : alertsLabel === "Blocked"
        ? "bg-[var(--kk-danger-bg)] text-[var(--kk-danger-ink)]"
        : "bg-[var(--kk-smoke)] text-[var(--kk-ash)]";
  const alertsReady = isAlertsReady(alertsEnabled, alertsEnv);
  const showInstallHint = alertsEnabled && alertsEnv.isIos && !alertsEnv.isStandalone;
  const AlertIcon =
    alertsLabel === "Enabled"
      ? Bell
      : alertsLabel === "Needs permission"
        ? BellRing
        : alertsLabel === "Blocked"
          ? ShieldAlert
          : alertsLabel === "Install required"
            ? Smartphone
            : BellOff;

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

      setTemplates(normalized);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecurring();
  }, [loadRecurring, refreshKey]);

  useEffect(() => {
    const env = getAlertsEnvironment();
    const enabled = getAlertsEnabled();
    setAlertsEnv(env);
    setAlertsEnabled(enabled);
    setAlertsStatus(getAlertsStatus(enabled, env));
    setAlertsLastSync(getAlertsLastSyncAt());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setAlertsEnv(getAlertsEnvironment());
        setAlertsLastSync(getAlertsLastSyncAt());
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const handleSwMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "TEST_NOTIFICATION_SENT") return;
    };
    navigator.serviceWorker.addEventListener("message", handleSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleSwMessage);
    };
  }, []);

  useEffect(() => {
    onMobileSheetChange?.(Boolean(actionSheetTemplate));
  }, [actionSheetTemplate, onMobileSheetChange]);

  useEffect(() => {
    return () => {
      onMobileSheetChange?.(false);
    };
  }, [onMobileSheetChange]);

  const dueSoonTemplates = useMemo(
    () =>
      activeTemplates.filter((template) => {
        const dueAt = template.recurring_next_due_at;
        const reminderDays = template.recurring_reminder_days ?? 5;
        return isDueSoon(dueAt, reminderDays);
      }),
    [activeTemplates]
  );

  const dueSoonTemplateIds = useMemo(() => {
    return new Set(dueSoonTemplates.map((template) => template._id));
  }, [dueSoonTemplates]);

  const filteredTemplates = useMemo(() => {
    if (recurringFilter === "active") return activeTemplates;
    if (recurringFilter === "ended") return endedTemplates;
    return [...activeTemplates, ...endedTemplates];
  }, [activeTemplates, endedTemplates, recurringFilter]);

  useEffect(() => {
    if (recurringFilter === "ended" && endedTemplates.length === 0) {
      setRecurringFilter("active");
    }
  }, [recurringFilter, endedTemplates.length]);


  const mergedTemplates = useMemo(() => {
    const sorted = [...filteredTemplates];
    sorted.sort((a, b) => {
      const aDueSoon = dueSoonTemplateIds.has(a._id);
      const bDueSoon = dueSoonTemplateIds.has(b._id);
      if (aDueSoon !== bDueSoon) return aDueSoon ? -1 : 1;
      return a.recurring_next_due_at - b.recurring_next_due_at;
    });
    return sorted;
  }, [dueSoonTemplateIds, filteredTemplates]);


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
    await deleteRecurringTemplate(template._id);
    await loadRecurring();
    const env = getAlertsEnvironment();
    if (isAlertsReady(getAlertsEnabled(), env)) {
      const allTemplates = await getRecurringTemplates();
      await syncAlertsQueue(allTemplates, { force: true });
      setAlertsLastSync(getAlertsLastSyncAt());
    }
  };

  const handleAlertsToggle = async () => {
    const nextEnabled = !alertsEnabled;
    setAlertsEnabled(nextEnabled);
    persistAlertsEnabled(nextEnabled);

    if (!nextEnabled) {
      await clearAlertsQueue();
      setAlertsStatus(getAlertsStatus(false, alertsEnv));
      return;
    }

    const env = getAlertsEnvironment();
    setAlertsEnv(env);

    if (!env.isSupported) {
      setAlertsStatus(getAlertsStatus(true, env));
      return;
    }

    if (env.isIos && !env.isStandalone) {
      setAlertsStatus("disabled");
      return;
    }

    setAlertsBusy(true);
    const permission = await requestNotificationPermission();
    const nextEnv = { ...env, permission };
    setAlertsEnv(nextEnv);
    setAlertsStatus(getAlertsStatus(true, nextEnv));

    if (permission === "granted") {
      await syncAlertsQueue(templates, { force: true });
      setAlertsLastSync(getAlertsLastSyncAt());
      await sendTestNotification();
    }

    setAlertsBusy(false);
  };

  const handleTestNotification = async () => {
    const env = getAlertsEnvironment();
    setAlertsBusy(true);
    await sendTestNotification();
    setAlertsBusy(false);
  };


  const renderCard = (
    template: Recurring_template,
    showDueBadge = false,
    isEnded = false
  ) => {
    const dueAt = template.recurring_next_due_at;
    const reminderDays = template.recurring_reminder_days ?? 5;
    const urgency = getUrgencyLevel(dueAt, reminderDays);
    const dueLabel = formatDueDate(dueAt);

    const amortizePeriods: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };
    const periods = amortizePeriods[template.recurring_frequency] ?? 1;
    const amortizedAmount = template.recurring_amortize && periods > 1
      ? Math.floor((template.amount / periods) * 100) / 100
      : null;

    const cardTone = isEnded
      ? {
        base: "border-[var(--kk-smoke)] bg-[var(--kk-cream)]/70",
        hover: "hover:border-[var(--kk-smoke-heavy)]",
      }
      : urgency === "urgent"
        ? {
          base: "border-[var(--kk-danger)]/25 bg-[var(--kk-danger-bg)]",
          hover: "hover:border-[var(--kk-danger)]/45",
        }
        : urgency === "soon"
          ? {
            base: "border-[var(--kk-saffron)]/45 bg-[var(--kk-saffron)]/12",
            hover: "hover:border-[var(--kk-saffron)]/60",
          }
          : {
            base: "border-[var(--kk-smoke)] bg-white",
            hover: "hover:border-[var(--kk-smoke-heavy)]",
          };

    return (
      <motion.div
        key={template._id}
        variants={cardVariants}
        className={`group relative flex items-center justify-between gap-3 overflow-hidden kk-radius-md border p-4 pl-5 pr-4 transition-all ${cardTone.base} ${cardTone.hover} hover:shadow-[var(--kk-shadow-sm)]`}
      >
        <div className="flex flex-1 min-w-0 items-center gap-3">
          <div className="kk-category-icon h-9 w-9 flex-none shrink-0">
            <CategoryIcon category={template.category} className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-[var(--kk-ink)]">
              {template.item}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 gap-y-1 text-xs">
              {/* <span className="inline-flex items-center gap-1 rounded-full bg-[var(--kk-cream)] px-2.5 py-1 font-medium text-[var(--kk-ash)]">
                <Clock className="h-3 w-3" />
                {FREQUENCY_LABEL_MAP[template.recurring_frequency]}
              </span> */}
              {showDueBadge ? (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold whitespace-nowrap ${urgency === "urgent"
                    ? "bg-[var(--kk-danger-bg)] text-[var(--kk-danger-ink)]"
                    : urgency === "soon"
                      ? "bg-[var(--kk-saffron)]/12 text-[#856404]"
                      : "bg-[var(--kk-smoke)] text-[var(--kk-ash)]"
                    }`}
                >
                  <Calendar className="h-3 w-3" />
                  {dueLabel}
                </span>
              ) : isEnded ? (
                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold whitespace-nowrap bg-[var(--kk-smoke)] text-[var(--kk-ash)]">
                  <Calendar className="h-3 w-3" />
                  Ended:{" "}
                  {new Date(template.recurring_end_date).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink items-center gap-1.5 -mt-1 sm:mt-0 sm:gap-2">
          <div className="flex flex-col items-end gap-0.5">
            <div className="kk-amount max-w-[24vw] overflow-hidden text-ellipsis whitespace-nowrap text-right text-[clamp(0.85rem,3.8vw,1rem)] sm:max-w-none sm:text-base">
              <span className="kk-rupee">₹</span>
              {formatCurrency(template.amount)}
            </div>
            {amortizedAmount !== null && (
              <div className="flex items-center rounded-full bg-[var(--kk-ember)]/10 px-2 py-0.5 whitespace-nowrap">
                <span className="text-[10px] font-semibold text-[var(--kk-ember)] font-[family:var(--font-mono)]">
                  ÷{periods} · ₹{formatCurrency(amortizedAmount)}/mo
                </span>
              </div>
            )}
          </div>

          <div
            className={`hidden flex-none items-center justify-end gap-1 transition-opacity sm:flex sm:focus-within:opacity-100 ${calendarPicker?.templateId === template._id ? "opacity-100" : "opacity-0 sm:group-hover:opacity-100"}`}
            onMouseLeave={() => { setConfirmDeleteId(null); }}
          >
            <button
              type="button"
              onClick={() => {
                setConfirmDeleteId(null);
                onEditRecurring(template);
              }}
              aria-label={isEnded ? `Reactivate ${template.item} recurring template` : `Edit ${template.item} recurring template`}
              className="kk-icon-btn kk-icon-btn-ghost hidden h-8 w-8 sm:inline-flex sm:h-9 sm:w-9"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                setConfirmDeleteId(null);
                setCalendarPicker(
                  calendarPicker?.templateId === template._id
                    ? null
                    : { templateId: template._id, anchorEl: e.currentTarget as unknown as HTMLElement }
                );
              }}
              aria-label={`Add ${template.item} to calendar`}
              className="kk-icon-btn kk-icon-btn-ghost hidden h-8 w-8 sm:inline-flex sm:h-9 sm:w-9"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
            </motion.button>
            {calendarPicker?.templateId === template._id && (
              <CalendarPickerPopover
                anchorEl={calendarPicker.anchorEl}
                onClose={() => setCalendarPicker(null)}
                onGoogleCalendar={() => { openGoogleCalendar(template); setCalendarPicker(null); }}
                onDownloadICS={() => { downloadICS(template, toICSFilename(template.item)); setCalendarPicker(null); }}
              />
            )}
            {!isEnded && (
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteId !== template._id) {
                    setConfirmDeleteId(template._id);
                    return;
                  }
                  setConfirmDeleteId(null);
                  handleDelete(template);
                }}
                aria-label={
                  confirmDeleteId === template._id
                    ? `Confirm delete ${template.item} recurring template`
                    : `Delete ${template.item} recurring template`
                }
                title={
                  confirmDeleteId === template._id
                    ? "Deletes all future scheduled transactions."
                    : undefined
                }
                className={`kk-icon-btn kk-icon-btn-ghost h-8 w-8 sm:h-9 sm:w-9 ${confirmDeleteId === template._id ? "text-[var(--kk-ember)]" : "kk-icon-btn-danger"
                  }`}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {confirmDeleteId === template._id ? (
                    <motion.span
                      key="confirm"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </motion.span>
                  ) : (
                    <motion.span
                      key="delete"
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.6, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setConfirmDelete(false);
              setActionSheetTemplate(template);
            }}
            aria-label={`More actions for ${template.item}`}
            className="kk-icon-btn kk-icon-btn-ghost h-8 w-8 kk-mobile-only"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
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


  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white/80 p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,133,0,0.12),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(46,164,79,0.12),transparent_52%)]" />
        <div className="absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[var(--kk-ember)]/10 blur-2xl" />
        <div className="relative grid gap-4 grid-cols-[1fr_auto] items-center">
          <div className="flex items-start gap-4">
            <div
              className={`relative flex h-12 w-12 items-center justify-center rounded-2xl border ${alertsReady
                ? "border-[var(--kk-sage)]/30 bg-[var(--kk-sage-bg)] text-[var(--kk-sage)]"
                : "border-[var(--kk-smoke)] bg-[var(--kk-cream)] text-[var(--kk-ash)]"
                }`}
            >
              <AlertIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm font-semibold text-[var(--kk-ink)]">Alerts & reminders</div>
              </div>
              <div className="mt-1 text-xs text-[var(--kk-ash)]">
                Daily 9:00 AM reminders for upcoming dues.
              </div>
              {null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:justify-end">
            <button
              type="button"
              role="switch"
              aria-checked={alertsEnabled}
              aria-label="Enable alerts"
              onClick={handleAlertsToggle}
              disabled={alertsBusy}
              className={`group relative h-7 w-[54px] rounded-full border transition-all ${alertsEnabled
                ? "border-[var(--kk-ember)]/50 bg-[var(--kk-ember)]/20 shadow-[0_6px_14px_-10px_rgba(222,88,38,0.6)]"
                : "border-[var(--kk-smoke-heavy)] bg-[var(--kk-cream)]"
                }`}
            >
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full ${alertsEnabled
                  ? "shadow-[inset_0_0_0_1px_rgba(222,88,38,0.18)]"
                  : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.04)]"
                  }`}
              />
              <span
                aria-hidden="true"
                className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_6px_12px_-8px_rgba(18,18,18,0.6)] transition ${alertsEnabled ? "right-[6px] ring-2 ring-[var(--kk-ember)]/20"
                  : "left-[6px]"
                  }`}
              />
            </button>
          </div>
        </div>

        {(alertsStatus === "blocked" || alertsStatus === "unsupported" || showInstallHint) && (
          <div className="relative mt-4 rounded-xl border border-[var(--kk-smoke)] bg-white/80 px-3 py-2 text-xs text-[var(--kk-ash)]">
            {alertsStatus === "blocked" && (
              <span>Notifications are blocked. Enable them in your browser settings.</span>
            )}
            {alertsStatus === "unsupported" && (
              <span>This browser does not support notification alerts.</span>
            )}
            {showInstallHint && (
              <span className="inline-flex items-center gap-1">
                <Smartphone className="h-3.5 w-3.5" />
                Add to Home Screen to get alerts on iOS.
              </span>
            )}
          </div>
        )}
      </section>

      {/* Summary Header - Only show if there are active templates */}
      {activeTemplates.length > 0 && (
        <div className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white via-white to-[var(--kk-cream)]/50 p-6">
          {/* Decorative elements */}
          <div className="absolute -right-8 -top-8 opacity-[0.04]">
            <TrendingUp className="h-40 w-40 text-[var(--kk-ink)]" />
          </div>

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-center sm:text-left">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-[var(--kk-ash)] whitespace-nowrap">
                    Monthly Commitment
                  </div>
                  <div className="font-[family:var(--font-display)] text-2xl font-bold text-[var(--kk-ink)]">
                    <span className="kk-rupee">₹</span>
                    <span className="font-[family:var(--font-mono)]">{formatCurrency(monthlyTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-center gap-3 text-sm sm:w-auto sm:justify-end">
              <div className="flex flex-col items-center rounded-xl bg-[var(--kk-cream)] px-4 py-2">
                <span className="font-[family:var(--font-mono)] text-xl font-bold text-[var(--kk-ink)]">{activeTemplates.length}</span>
                <span className="text-xs text-[var(--kk-ash)]">Active</span>
              </div>
              {dueSoonTemplates.length > 0 && (
                <div className="flex flex-col items-center rounded-xl bg-[var(--kk-saffron)]/10 px-4 py-2">
                  <span className="font-[family:var(--font-mono)] text-xl font-bold text-[var(--kk-saffron)]">{dueSoonTemplates.length}</span>
                  <span className="text-xs text-[var(--kk-ash)] whitespace-nowrap">Due Soon</span>
                </div>
              )}
              <motion.button
                type="button"
                whileHover={{ scale: 1.05, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => downloadICS(activeTemplates, "kharchakitab-recurring.ics")}
                className="group/export relative flex flex-col items-center rounded-xl border border-[var(--kk-ember)]/20 bg-gradient-to-b from-[var(--kk-ember)]/8 to-[var(--kk-ember)]/15 px-4 py-2 transition-all hover:border-[var(--kk-ember)]/35 hover:shadow-[0_4px_16px_-6px_rgba(222,88,38,0.3)]"
              >
                <span className="flex h-7 items-center justify-center">
                  <CalendarPlus className="h-5 w-5 text-[var(--kk-ember)] transition-transform group-hover/export:scale-110" />
                </span>
                <span className="text-xs font-semibold text-[var(--kk-ember)] whitespace-nowrap">Add to Cal</span>
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* All Recurring Section */}
      {mergedTemplates.length > 0 && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--kk-sage-bg)]">
                <Repeat className="h-4 w-4 text-[var(--kk-sage)]" />
              </div>
              <h2 className="font-[family:var(--font-display)] text-lg font-semibold text-[var(--kk-ink)]">
                Manage Subscriptions
              </h2>
            </div>
            {endedTemplates.length > 0 && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                {(["active", "ended"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setRecurringFilter(filter)}
                    className={`flex-1 sm:flex-none text-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] transition ${recurringFilter === filter
                      ? "border-[var(--kk-ember)] bg-[var(--kk-ember)] text-white"
                      : "border-[var(--kk-smoke)] bg-white/80 text-[var(--kk-ash)] hover:border-[var(--kk-ember)]/40"
                      }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}
          </div>

          <motion.div
            variants={containerVariants}
            initial={false}
            animate="visible"
            className="grid gap-4"
          >
            <AnimatePresence mode="popLayout">
              {mergedTemplates.map((template) =>
                renderCard(
                  template,
                  recurringFilter !== "ended",
                  recurringFilter === "ended" || (recurringFilter === "all" && now > template.recurring_end_date)
                )
              )}
            </AnimatePresence>
          </motion.div>
        </motion.section>
      )}
      {mergedTemplates.length > 0 && (
        <div className="border-t border-dashed border-[var(--kk-smoke-heavy)]" />
      )}

      {/* Templates Section */}
      <section>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--kk-ember)]/12">
              <Sparkles className="h-4 w-4 text-[var(--kk-ember)]" />
            </div>
            <h2 className="font-[family:var(--font-display)] text-lg font-semibold text-[var(--kk-ink)] whitespace-nowrap">
              Add Subscription
            </h2>
          </div>
          <p className="mt-1 text-xs text-[var(--kk-ash)]/90">
            Start quickly with common recurring expenses
          </p>
        </div>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white to-[var(--kk-cream)]/30 p-5 sm:p-6"
        >
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-5"
          >
            {TEMPLATE_GROUPS.map((group) => {
              const groupTemplates = RECURRING_TEMPLATES.filter(
                (t) => t.group === group.key
              );
              const isOpen = expandedGroups.has(group.key);
              const visibleTemplates = groupTemplates.filter(
                (t) => !usedTemplateIds.has(t.id)
              );
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
        </motion.section>

        {/* OPTION B — Standalone "Add custom" button below all groups */}
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAddRecurring()}
          className="group mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--kk-smoke-heavy)] bg-transparent py-3 text-sm font-medium text-[var(--kk-ash)] transition-all hover:border-[var(--kk-ember)]/50 hover:text-[var(--kk-ember)]"
        >
          <Plus className="h-4 w-4" />
          Add custom recurring
        </motion.button>
      </section>

      {actionSheetTemplate && (
        <AnimatePresence>
          <motion.div
            key="recurring-action-sheet-overlay"
            aria-label="Close recurring actions"
            className="fixed inset-0 z-40 bg-[var(--kk-void)]/40 backdrop-blur-sm sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              setConfirmDelete(false);
              setActionSheetTemplate(null);
            }}
          />
          <motion.div
            key="recurring-action-sheet-panel"
            className="fixed inset-x-0 bottom-0 z-50 bg-white sm:hidden"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            role="dialog"
            aria-modal="true"
            aria-label={`Actions for ${actionSheetTemplate.item}`}
          >
            <div className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <div
                className="kk-radius-top-xl border border-[var(--kk-smoke)] bg-white p-4 shadow-[var(--kk-shadow-lg)]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-[var(--kk-ink)]">
                      {actionSheetTemplate.item}
                    </div>
                    <div className="mt-1 text-xs text-[var(--kk-ash)]">
                      {FREQUENCY_LABEL_MAP[actionSheetTemplate.recurring_frequency]}
                    </div>
                  </div>
                  <div className="kk-amount text-right text-base sm:text-lg">
                    <span className="kk-rupee">₹</span>
                    {formatCurrency(actionSheetTemplate.amount)}
                  </div>
                </div>

                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    className="kk-btn-secondary flex items-center justify-center gap-2"
                    onClick={() => {
                      onEditRecurring(actionSheetTemplate);
                      setConfirmDelete(false);
                      setActionSheetTemplate(null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="kk-btn-secondary flex items-center justify-center gap-2 border-[var(--kk-ember)]/20 bg-gradient-to-b from-[var(--kk-ember)]/5 to-[var(--kk-ember)]/10 text-[var(--kk-ink)] active:scale-[0.97] transition-all hover:border-[var(--kk-ember)]/40"
                      onClick={() => {
                        openGoogleCalendar(actionSheetTemplate);
                        setActionSheetTemplate(null);
                      }}
                    >
                      <Globe className="h-4 w-4 text-[var(--kk-ember)]" />
                      Google Calendar
                    </button>
                    <button
                      type="button"
                      className="kk-btn-secondary flex items-center justify-center gap-2 border-dashed border-[var(--kk-smoke-heavy)] text-[var(--kk-ash)] active:scale-[0.97] transition-all hover:border-solid hover:border-[var(--kk-ember)]/40 hover:text-[var(--kk-ember)]"
                      onClick={() => {
                        downloadICS(actionSheetTemplate, toICSFilename(actionSheetTemplate.item));
                        setActionSheetTemplate(null);
                      }}
                    >
                      <Download className="h-4 w-4" />
                      Download .ics
                    </button>
                  </div>
                  {actionSheetTemplate.recurring_end_date >= Date.now() && (
                    <button
                      type="button"
                      className={`kk-btn-secondary flex items-center justify-center gap-2 ${confirmDelete ? "border-[var(--kk-ember)] text-[var(--kk-ember)]" : ""
                        }`}
                      onClick={() => {
                        if (!confirmDelete) {
                          setConfirmDelete(true);
                          return;
                        }
                        handleDelete(actionSheetTemplate);
                        setConfirmDelete(false);
                        setActionSheetTemplate(null);
                      }}
                    >
                      {confirmDelete ? (
                        "Confirm delete"
                      ) : (
                        <>
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </>
                      )}
                    </button>
                  )}
                </div>
                {confirmDelete && (
                  <div className="mt-3 bg-[var(--kk-smoke)] p-2 rounded-lg text-center text-[10px] text-[var(--kk-ash)] uppercase tracking-wider font-bold">
                    Deletes all future scheduled transactions.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
});

RecurringView.displayName = "RecurringView";
