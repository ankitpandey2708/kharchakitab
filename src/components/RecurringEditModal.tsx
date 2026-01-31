"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Calendar, Clock } from "lucide-react";
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
import type { Transaction } from "@/src/types";

interface RecurringEditModalProps {
  isOpen: boolean;
  mode: "new" | "edit";
  template?: RecurringTemplate | null;
  transaction?: Transaction | null;
  onClose: () => void;
  onSave: (data: Transaction) => void;
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

export const RecurringEditModal = ({
  isOpen,
  mode,
  template,
  transaction,
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
  const [reminderDays, setReminderDays] = useState(3);

  useEffect(() => {
    if (!isOpen) return;
    if (mode === "edit" && transaction) {
      setName(transaction.item);
      setAmountValue(transaction.amount.toString());
      setCategory(transaction.category);
      setPaymentMethod(transaction.paymentMethod);
      setFrequency(transaction.recurring_frequency ?? "monthly");
      setStartDate(
        toDateInputValue(transaction.recurring_start_date ?? Date.now())
      );
      setEndDate(
        toDateInputValue(transaction.recurring_end_date ?? Date.now())
      );
      setReminderDays(transaction.recurring_reminder_days ?? 3);
      return;
    }
    if (template) {
      setName(template.name);
      setAmountValue(template.suggestedAmount?.toString() ?? "");
      setCategory(template.category);
      setPaymentMethod("upi");
      setFrequency(template.suggestedFrequency);
      setStartDate(toDateInputValue(Date.now()));
      setEndDate(toDateInputValue(Date.now()));
      setReminderDays(3);
      return;
    }
    setName("");
    setAmountValue("");
    setCategory("Bills");
    setPaymentMethod("upi");
    setFrequency("monthly");
    setStartDate(toDateInputValue(Date.now()));
    setEndDate(toDateInputValue(Date.now()));
    setReminderDays(3);
  }, [isOpen, mode, template, transaction]);

  useEscapeKey(isOpen, onClose);

  const validation = useMemo(() => {
    const amount = normalizeAmount(Number(amountValue || 0));
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);
    if (!name.trim() || amount <= 0) return { ok: false, error: "" };
    if (!startTs || !endTs) return { ok: false, error: "Enter valid dates" };
    if (startTs > endTs) return { ok: false, error: "End date must be after start date" };
    return { ok: true, error: "" };
  }, [amountValue, endDate, name, startDate]);

  const handleSave = () => {
    if (!validation.ok) return;
    const amount = normalizeAmount(Number(amountValue || 0));
    const startTs = toTimestamp(startDate);
    const endTs = toTimestamp(endDate);
    if (!startTs || !endTs) return;

    const existing = transaction;
    let nextDue = existing?.timestamp ?? startTs;
    if (nextDue < startTs || nextDue > endTs) {
      nextDue = startTs;
    }

    const next: Transaction = {
      ...(existing ?? {}),
      id: existing?.id ?? "",
      amount,
      item: name.trim(),
      category,
      paymentMethod,
      timestamp: nextDue,
      source: existing?.source ?? "manual",
      recurring: true,
      recurring_frequency: frequency,
      recurring_start_date: startTs,
      recurring_end_date: endTs,
      recurring_template_id: template?.id ?? existing?.recurring_template_id,
      recurring_reminder_days: reminderDays,
    };

    onSave(next);
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
            className="w-full max-w-md overflow-hidden kk-radius-top-xl bg-white kk-shadow-lg max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-center pt-3 pb-2 sticky top-0 bg-white">
              <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
            </div>

            <div className="px-5 pb-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="mt-1 text-xl font-semibold font-[family:var(--font-display)]">
                    {mode === "new" ? "Add Recurring Expense" : "Edit Recurring"}
                  </div>
                </div>
                <button type="button" onClick={onClose} className="kk-icon-btn">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5">
                <div className="kk-label">Name</div>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g., Netflix, Rent, Gym"
                  className="kk-input mt-2"
                />
              </div>

              <div className="mt-4 kk-radius-md border border-[var(--kk-smoke)] bg-[var(--kk-cream)] p-4">
                <div className="kk-label">Amount</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-bold text-[var(--kk-ember)]">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amountValue}
                    onChange={(event) => setAmountValue(sanitizeAmountInput(event.target.value))}
                    className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none font-[family:var(--font-mono)] placeholder:text-[var(--kk-ash)]"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="kk-label flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Frequency
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FREQUENCY_OPTIONS.map((option) => {
                    const isActive = frequency === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setFrequency(option.key)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          isActive
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

              <div className="mt-4">
                <div className="kk-label">Category</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isActive = category === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setCategory(option.key)}
                        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          isActive
                            ? "border-[var(--kk-ember)] bg-[var(--kk-ember)] text-white"
                            : "border-[var(--kk-smoke-heavy)] text-[var(--kk-ink)] hover:border-[var(--kk-ember)]"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        {option.key}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="kk-label">Payment Method</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = paymentMethod === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setPaymentMethod(option.key)}
                          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            isActive
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
                <div>
                  <div className="kk-label">Reminder (days)</div>
                  <input
                    type="number"
                    min="0"
                    value={reminderDays}
                    onChange={(event) => setReminderDays(Number(event.target.value || 0))}
                    className="kk-input mt-2 h-9"
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="kk-label flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Start Date
                  </div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                    className="kk-input mt-2 h-9"
                  />
                </div>
                <div>
                  <div className="kk-label flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    End Date
                  </div>
                  <input
                    type="date"
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(event) => setEndDate(event.target.value)}
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
                disabled={!validation.ok}
                className="kk-btn-primary mt-6 w-full"
              >
                {mode === "new" ? "Save recurring" : "Update recurring"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
