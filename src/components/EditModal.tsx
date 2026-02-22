"use client";

import React, { startTransition, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Listbox, Transition } from "@headlessui/react";
import { Lock, ShieldCheck, X, ChevronDown, Check } from "lucide-react";
import { CATEGORY_OPTIONS } from "@/src/config/categories";
import { PAYMENT_OPTIONS, type PaymentKey } from "@/src/config/payments";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { toDateInputValue } from "@/src/utils/dates";
import { normalizeAmount } from "@/src/utils/money";

interface EditModalProps {
  isOpen: boolean;
  mode?: "new" | "edit";
  amount: number;
  item: string;
  category: string;
  paymentMethod?: "cash" | "upi" | "card" | "unknown";
  timestamp?: number;
  isPrivate?: boolean;
  isShared?: boolean;
  showHousehold?: boolean;
  onClose: () => void;
  onSave: (data: {
    amount: number;
    item: string;
    category: string;
    paymentMethod: "cash" | "upi" | "card" | "unknown";
    timestamp: number;
    isPrivate?: boolean;
  }) => void;
}

const mergeDateWithTime = (dateValue: string, timeValue: number) => {
  const time = new Date(timeValue);
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return timeValue;
  const merged = new Date(
    year,
    month - 1,
    day,
    time.getHours(),
    time.getMinutes(),
    time.getSeconds(),
    time.getMilliseconds()
  );
  return Number.isNaN(merged.getTime()) ? timeValue : merged.getTime();
};

const sanitizeAmountInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [intPart, decimalPart = ""] = cleaned.split(".");
  const trimmedDecimals = decimalPart.slice(0, 2);
  return trimmedDecimals.length > 0 ? `${intPart}.${trimmedDecimals}` : intPart;
};

export const EditModal = React.memo(({
  isOpen,
  mode = "edit",
  amount,
  item,
  category,
  paymentMethod = "cash",
  timestamp = Date.now(),
  isPrivate = false,
  isShared = false,
  showHousehold = false,
  onClose,
  onSave,
}: EditModalProps) => {
  const [amountValue, setAmountValue] = useState(amount.toString());
  const [itemValue, setItemValue] = useState(item);
  const [categoryValue, setCategoryValue] = useState(category);
  const [paymentValue, setPaymentValue] = useState<
    PaymentKey
  >(paymentMethod);
  const [dateValue, setDateValue] = useState(toDateInputValue(timestamp));
  const [isPrivateValue, setIsPrivateValue] = useState(isPrivate);
  const sortedCategoryOptions = useMemo(
    () => [...CATEGORY_OPTIONS].sort((a, b) => a.label.localeCompare(b.label)),
    []
  );

  useEffect(() => {
    if (isOpen) {
      startTransition(() => {
        setAmountValue(amount.toString());
        setItemValue(item);
        setCategoryValue(category);
        setPaymentValue(paymentMethod);
        setDateValue(toDateInputValue(timestamp));
        setIsPrivateValue(isPrivate);
      });
    }
  }, [isOpen, amount, item, category, paymentMethod, timestamp, isPrivate]);

  useEscapeKey(isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--kk-void)]/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
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
            className="w-full max-w-md overflow-hidden kk-radius-top-xl border border-[var(--kk-smoke)] bg-[var(--kk-cream)] kk-shadow-lg max-h-[90vh] overflow-y-auto"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
            </div>

            <div className="px-5 pb-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--kk-ash)]">
                    Expense
                  </div>
                  <div className="mt-1 text-2xl font-semibold font-[family:var(--font-display)] text-[var(--kk-ink)]">
                    {mode === "new" ? "Add expense" : "Edit expense"}
                  </div>
                  <div className="mt-1 text-xs text-[var(--kk-ash)]">
                    Keep details clean for smarter insights.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="kk-icon-btn mt-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Amount Input */}
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
                    onChange={(event) =>
                      setAmountValue(sanitizeAmountInput(event.target.value))
                    }
                    className="w-full bg-transparent text-4xl font-bold tracking-tight outline-none font-[family:var(--font-mono)] placeholder:text-[var(--kk-ash)]"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Item Input */}
              <div className="mt-4 kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                  Details
                </div>
                <input
                  value={itemValue}
                  onChange={(event) => setItemValue(event.target.value)}
                  placeholder="What was this for?"
                  className="kk-input mt-3"
                />
                <div className="mt-3">
                  <div className="kk-label">Category</div>
                  <Listbox value={categoryValue} onChange={setCategoryValue}>
                    <div className="relative mt-2">
                      <Listbox.Button className="kk-input kk-select flex w-full items-center justify-between pr-10 text-sm">
                        <span className="truncate">
                          {sortedCategoryOptions.find((option) => option.key === categoryValue)?.label ?? "Select"}
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

              {/* Payment & Date Row */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                    Payment
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PAYMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = paymentValue === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setPaymentValue(option.key)}
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
                    Date
                  </div>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                    className="kk-input mt-3 text-sm"
                  />
                </div>
              </div>

              {showHousehold && (
                <div className={`mt-4 kk-radius-lg border px-4 py-3 ${isShared
                  ? "border-[var(--kk-smoke-heavy)] bg-[var(--kk-smoke)]/70"
                  : isPrivateValue
                    ? "border-[var(--kk-ember)]/35 bg-white"
                    : "border-[var(--kk-smoke)] bg-[var(--kk-cream)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 flex h-9 w-9 items-center justify-center kk-radius-full border ${isShared
                        ? "border-[var(--kk-smoke-heavy)] bg-white/80 text-[var(--kk-ash)]"
                        : isPrivateValue
                          ? "border-[var(--kk-ember)]/40 bg-[var(--kk-ember)]/10 text-[var(--kk-ember)]"
                          : "border-[var(--kk-smoke-heavy)] bg-white text-[var(--kk-ink)]"
                        }`}
                      >
                        {isPrivateValue ? <Lock className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-[var(--kk-ink)]">
                            Privacy
                          </div>
                          {isShared && (
                            <span className="rounded-full border border-[var(--kk-smoke-heavy)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--kk-ash)]">
                              Shared
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--kk-ash)]">
                          {isShared
                            ? "Already shared. Can’t be hidden later."
                            : isPrivateValue
                              ? "Only on this device."
                              : "Visible to household on next sync."}
                        </div>
                      </div>
                    </div>
                    {!isShared && (
                      <div
                        role="group"
                        aria-label="Privacy setting"
                        className="inline-flex items-center rounded-full border border-[var(--kk-smoke-heavy)] bg-white p-0.5 text-[11px] font-semibold"
                      >
                        <button
                          type="button"
                          onClick={() => setIsPrivateValue(false)}
                          aria-pressed={!isPrivateValue}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${!isPrivateValue
                            ? "bg-[var(--kk-ink)] text-white shadow-sm"
                            : "text-[var(--kk-ink)]"
                            }`}
                        >
                          <ShieldCheck className="h-3 w-3" />
                          Shared
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPrivateValue(true)}
                          aria-pressed={isPrivateValue}
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${isPrivateValue
                            ? "bg-[var(--kk-ember)] text-white shadow-[0_6px_14px_rgba(234,84,85,0.25)]"
                            : "text-[var(--kk-ink)]"
                            }`}
                        >
                          <Lock className="h-3 w-3" />
                          Private
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Save Button */}
              <button
                type="button"
                onClick={() =>
                  onSave({
                    amount: normalizeAmount(Number(amountValue || 0)),
                    item: itemValue,
                    category: categoryValue,
                    paymentMethod: paymentValue,
                    timestamp: dateValue
                      ? mergeDateWithTime(dateValue, timestamp)
                      : timestamp,
                    isPrivate: isPrivateValue,
                  })
                }
                disabled={Number(amountValue || 0) <= 0}
                className="kk-btn-primary mt-5 w-full py-3.5 text-base"
              >
                Save Changes
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

EditModal.displayName = "EditModal";
