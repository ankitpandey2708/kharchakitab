"use client";

import React, { startTransition, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Listbox, Transition } from "@headlessui/react";
import { X, Calendar, Clock, ChevronDown, Check, Repeat } from "lucide-react";
import { CATEGORY_OPTIONS } from "@/src/config/categories";
import { PAYMENT_OPTIONS, type PaymentKey } from "@/src/config/payments";
import {
  FREQUENCY_OPTIONS,
  type Frequency,
  type RecurringTemplate,
} from "@/src/config/recurring";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { toDateInputValue } from "@/src/utils/dates";
import { normalizeAmount } from "@/src/utils/money";
import type { Recurring_template } from "@/src/types";
import {
  createRecurringTemplate,
  getRecurringTemplates,
  updateRecurringTemplate,
} from "@/src/db/db";
import {
  getAlertsEnabled,
  getAlertsEnvironment,
  isAlertsReady,
  syncAlertsQueue,
} from "@/src/services/pwaAlerts";

interface RecurringEditModalProps {
  isOpen: boolean;
  mode: "new" | "edit";
  template?: RecurringTemplate | null; // UI template (for quick add)
  recurringTemplate?: Recurring_template | null; //  DB template (for editing)
  reactivatePreset?: boolean;
  onClose: () => void;
  onSave: () => void; // Just refresh, no data needed
}

const sanitizeAmountInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [intPart, decimalPart = ""] = cleaned.split(".");
  const trimmedDecimals = decimalPart.slice(0, 2);
  return trimmedDecimals.length > 0 ? `${intPart}.${trimmedDecimals}` : intPart;
};

const toTimestamp = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const addOneYear = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setFullYear(date.getFullYear() + 1);
  return date.getTime();
};


export const RecurringEditModal = React.memo(({
  isOpen,
  mode,
  template,
  recurringTemplate,
  reactivatePreset = false,
  onClose,
  onSave,
}: RecurringEditModalProps) => {
  const [name, setName] = useState("");
  const [amountValue, setAmountValue] = useState("");
  const [category, setCategory] = useState("Bills");
  const [paymentMethod, setPaymentMethod] = useState<PaymentKey>("upi");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(toDateInputValue(Date.now()));
  const [endDate, setEndDate] = useState(toDateInputValue(Date.now()));
  const [reminderDays, setReminderDays] = useState(5);
  const [amortize, setAmortize] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const sortedCategoryOptions = useMemo(
    () => [...CATEGORY_OPTIONS].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  useEffect(() => {
    if (!isOpen) return;

    startTransition(() => {
      // Edit mode: load from DB template
      if (mode === "edit" && recurringTemplate) {
        setName(recurringTemplate.item);
        setAmountValue(recurringTemplate.amount.toString());
        setCategory(recurringTemplate.category);
        setPaymentMethod(recurringTemplate.paymentMethod);
        setFrequency(recurringTemplate.recurring_frequency);
        if (reactivatePreset) {
          const now = Date.now();
          setStartDate(toDateInputValue(now));
          setEndDate(toDateInputValue(addOneYear(now)));
        } else {
          setStartDate(toDateInputValue(recurringTemplate.recurring_start_date));
          setEndDate(toDateInputValue(recurringTemplate.recurring_end_date));
        }
        setReminderDays(recurringTemplate.recurring_reminder_days);
        setAmortize(recurringTemplate.recurring_amortize ?? false);
        return;
      }

      // New mode with UI template (quick add)
      if (template) {
        setName(template.name);
        setAmountValue(template.suggestedAmount?.toString() ?? "");
        setCategory(template.category);
        setPaymentMethod("upi");
        setFrequency(template.suggestedFrequency);
        const now = Date.now();
        setStartDate(toDateInputValue(now));
        setEndDate(toDateInputValue(addOneYear(now)));
        setReminderDays(5);
        setAmortize(false);
        return;
      }

      // New mode blank
      setName("");
      setAmountValue("");
      setCategory("Bills");
      setPaymentMethod("upi");
      setFrequency("monthly");
      const now = Date.now();
      setStartDate(toDateInputValue(now));
      setEndDate(toDateInputValue(addOneYear(now)));
      setReminderDays(5);
      setAmortize(false);
    });
  }, [isOpen, mode, template, recurringTemplate, reactivatePreset]);

  useEscapeKey(isOpen, onClose);

  const validation = useMemo(() => {
    const amount = normalizeAmount(Number(amountValue || 0));
    const startTs = toTimestamp(startDate);
    if (!name.trim() || amount <= 0) return { ok: false, error: "" };
    if (!startTs) return { ok: false, error: "Enter a valid start date" };
    if (reminderDays > 7) return { ok: false, error: "Reminder must be 1-7 days" };
    return { ok: true, error: "" };
  }, [amountValue, name, startDate, reminderDays]);

  const handleSave = async () => {
    if (!validation.ok || isSaving) return;

    const amount = normalizeAmount(Number(amountValue || 0));
    const startTs = toTimestamp(startDate);
    const endTs = addOneYear(startTs!);
    if (!startTs || !endTs) return;

    setIsSaving(true);

    try {
      if (mode === "new") {
        // Create new template (also generates transactions)
        await createRecurringTemplate({
          item: name.trim(),
          category,
          amount,
          paymentMethod,
          recurring_frequency: frequency,
          recurring_start_date: startTs,
          recurring_end_date: endTs,
          recurring_reminder_days: reminderDays,
          recurring_amortize: amortize,
          recurring_template_id: template?.id ?? null,
        });

      } else if (recurringTemplate) {
        // Update existing template (deletes old txns, generates new ones)
        await updateRecurringTemplate(recurringTemplate._id, {
          item: name.trim(),
          category,
          amount,
          paymentMethod,
          recurring_frequency: frequency,
          recurring_start_date: startTs,
          recurring_end_date: endTs,
          recurring_reminder_days: reminderDays,
          recurring_amortize: amortize,
        });

      }

      const env = getAlertsEnvironment();
      if (isAlertsReady(getAlertsEnabled(), env)) {
        const templates = await getRecurringTemplates();
        await syncAlertsQueue(templates, { force: true });
      }

      onSave(); // Trigger parent to reload
      onClose();
    } catch (error) {
      alert("Failed to save recurring template. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--kk-void)]/40 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{
              type: "spring",
              damping: 30,
              stiffness: 300,
            }}
            className="w-full max-w-md overflow-hidden kk-radius-xl border border-[var(--kk-smoke)] bg-[var(--kk-cream)] kk-shadow-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-[var(--kk-cream)]">
              <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
            </div>

            <div className="px-5 pb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--kk-ash)]">
                    Recurring
                  </div>
                  <div className="mt-1 text-2xl font-semibold font-[family:var(--font-display)] text-[var(--kk-ink)]">
                    {mode === "new" ? "Add recurring" : "Edit recurring"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--kk-ash)]">
                    Set the cadence once, we'll keep it on track.
                  </div>
                </div>
                <button type="button" onClick={onClose} className="kk-icon-btn mt-1">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                  <span>Amount</span>
                  <span>Required</span>
                </div>
                <div className="mt-3 flex items-end gap-3">
                  <span className="rounded-full border border-[var(--kk-smoke-heavy)] bg-[var(--kk-cream)] px-2 py-1 text-2xl font-semibold text-[var(--kk-ember)]">
                    ₹
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amountValue}
                    onChange={(event) => setAmountValue(sanitizeAmountInput(event.target.value))}
                    className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none font-[family:var(--font-mono)] placeholder:text-[var(--kk-ash)]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="mt-4 kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                  Details
                </div>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., Netflix, Rent, Gym"
                  className="kk-input mt-3"
                />
                <div className="mt-3">
                  <div className="kk-label">Category</div>
                  <Listbox value={category} onChange={setCategory}>
                    <div className="relative mt-2">
                      <Listbox.Button className="kk-input kk-select flex w-full items-center justify-between pr-10 text-sm">
                        <span className="truncate">
                          {sortedCategoryOptions.find((option) => option.key === category)?.label ?? "Select"}
                        </span>
                        <ChevronDown className="h-4 w-4 text-[var(--kk-ash)]" />
                      </Listbox.Button>
                      <Transition
                        enter="transition ease-out duration-120"
                        enterFrom="opacity-0 -translate-y-1"
                        enterTo="opacity-100 translate-y-0"
                        leave="transition ease-in duration-90"
                        leaveFrom="opacity-100 translate-y-0"
                        leaveTo="opacity-0 -translate-y-1"
                      >
                        <Listbox.Options className="absolute z-50 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-[var(--kk-smoke)] bg-white p-1 text-sm shadow-[var(--kk-shadow-lg)]">
                          {sortedCategoryOptions.map((option) => (
                            <Listbox.Option
                              key={option.key}
                              value={option.key}
                              className={({ active }) =>
                                `flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm ${active
                                  ? "bg-[var(--kk-cream)] text-[var(--kk-ink)]"
                                  : "text-[var(--kk-ash)]"
                                }`
                              }
                            >
                              {({ selected }) => (
                                <>
                                  <span className={`truncate ${selected ? "font-semibold text-[var(--kk-ink)]" : ""}`}>
                                    {option.label}
                                  </span>
                                  {selected && <Check className="h-4 w-4 text-[var(--kk-ember)]" />}
                                </>
                              )}
                            </Listbox.Option>
                          ))}
                        </Listbox.Options>
                      </Transition>
                    </div>
                  </Listbox>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                    <span>Frequency</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {FREQUENCY_OPTIONS.map((option) => {
                      const isActive = frequency === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setFrequency(option.key)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${isActive
                            ? "border-[var(--kk-ember)] bg-[var(--kk-ember)] text-white"
                            : "border-[var(--kk-smoke-heavy)] text-[var(--kk-ink)] hover:border-[var(--kk-ember)]"
                            }`}
                        >
                          {option.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                    <span>Start date</span>
                  </div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="kk-input mt-3 h-9"
                  />
                </div>
              </div>

              {/* Amortize toggle — only for quarterly/yearly */}
              {(frequency === "quarterly" || frequency === "yearly") && (
                <div className="mt-4 kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-3.5 w-3.5 text-[var(--kk-ash)]" />
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                          Amortize
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--kk-ash)]">
                          Spread ÷{frequency === "yearly" ? 12 : 3} across months
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={amortize}
                      onClick={() => setAmortize((prev) => !prev)}
                      className={`relative h-7 w-[54px] flex-none rounded-full border transition-all ${amortize
                        ? "border-[var(--kk-ember)]/50 bg-[var(--kk-ember)]/20"
                        : "border-[var(--kk-smoke-heavy)] bg-[var(--kk-cream)]"
                        }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-[0_6px_12px_-8px_rgba(18,18,18,0.6)] transition-all ${amortize ? "right-[6px] ring-2 ring-[var(--kk-ember)]/20" : "left-[6px]"
                          }`}
                      />
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                    Payment
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = paymentMethod === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setPaymentMethod(option.key)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${isActive
                            ? "border-[var(--kk-ember)] bg-[var(--kk-ember)] text-white"
                            : "border-[var(--kk-smoke-heavy)] text-[var(--kk-ink)] hover:border-[var(--kk-ember)]"
                            }`}
                        >
                          <Icon className="h-3 w-3" />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                    Reminder
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--kk-ash)]">
                    Days before due
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={reminderDays}
                    onChange={(event) => setReminderDays(Number(event.target.value || 0))}
                    className="kk-input mt-2 h-9"
                  />
                </div>
              </div>

              {validation.error && (
                <div className="mt-3 text-xs text-[var(--kk-ember)]">
                  {validation.error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={!validation.ok || isSaving}
                className="kk-btn-primary mt-6 w-full"
              >
                {isSaving
                  ? "Saving..."
                  : mode === "new" ? "Save recurring" : "Update recurring"
                }
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

RecurringEditModal.displayName = "RecurringEditModal";
