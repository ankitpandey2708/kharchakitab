"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
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

export const EditModal = ({
  isOpen,
  mode = "edit",
  amount,
  item,
  category,
  paymentMethod = "cash",
  timestamp = Date.now(),
  isPrivate = false,
  isShared = false,
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

  useEffect(() => {
    if (isOpen) {
      setAmountValue(amount.toString());
      setItemValue(item);
      setCategoryValue(category);
      setPaymentValue(paymentMethod);
      setDateValue(toDateInputValue(timestamp));
      setIsPrivateValue(isPrivate);
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
            className="w-full max-w-md overflow-hidden kk-radius-top-xl bg-white kk-shadow-lg"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
            </div>

            <div className="px-5 pb-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="mt-1 text-xl font-semibold font-[family:var(--font-display)]">
                    {mode === "new" ? "Add Expense" : "Edit Expense"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="kk-icon-btn"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Amount Input */}
              <div className="mt-5 kk-radius-md border border-[var(--kk-smoke)] bg-[var(--kk-cream)] p-4">
                <div className="kk-label">Amount</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-3xl font-bold text-[var(--kk-ember)]">₹</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amountValue}
                    onChange={(event) =>
                      setAmountValue(sanitizeAmountInput(event.target.value))
                    }
                    className="w-full bg-transparent text-3xl font-bold tracking-tight outline-none font-[family:var(--font-mono)] placeholder:text-[var(--kk-ash)]"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Item Input */}
              <div className="mt-4">
                <div className="kk-label">Description</div>
                <input
                  value={itemValue}
                  onChange={(event) => setItemValue(event.target.value)}
                  placeholder="What did you spend on?"
                  className="kk-input mt-2"
                />
              </div>

              {/* Category Pills */}
              <div className="mt-4">
                <div className="kk-label">Category</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const isActive = categoryValue === option.key;
                    return (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() => setCategoryValue(option.key)}
                        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition ${isActive
                          ? "border-[var(--kk-ember)] bg-[var(--kk-ember)] text-white shadow-[var(--kk-shadow-sm)]"
                          : "border-[var(--kk-smoke-heavy)] text-[var(--kk-ink)] hover:border-[var(--kk-ember)] hover:bg-[var(--kk-ember)]/5"
                          }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.key}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Payment & Date Row */}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="kk-label">Payment</div>
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
                <div>
                  <div className="kk-label">Date</div>
                  <input
                    type="date"
                    value={dateValue}
                    onChange={(event) => setDateValue(event.target.value)}
                    className="kk-input mt-2 text-sm"
                  />
                </div>
              </div>

              <div className={`mt-4 flex items-center justify-between gap-3 kk-radius-md border border-[var(--kk-smoke)] px-4 py-3 ${isShared ? 'bg-[var(--kk-smoke)] opacity-70' : 'bg-[var(--kk-cream)]'}`}>
                <div>
                  <div className="text-sm font-medium text-[var(--kk-ink)]">
                    Private transaction
                  </div>
                  <div className="kk-meta">
                    {isShared ? "This transaction has already been shared." : "Excluded from household sync"}
                  </div>
                </div>
                {!isShared && (
                  <button
                    type="button"
                    onClick={() => setIsPrivateValue((prev) => !prev)}
                    aria-pressed={isPrivateValue}
                    className={`relative inline-flex h-6 w-11 items-center kk-radius-full transition ${isPrivateValue
                      ? "bg-[var(--kk-ember)]"
                      : "bg-[var(--kk-smoke-heavy)]"
                      }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform kk-radius-full bg-white transition ${isPrivateValue ? "translate-x-5" : "translate-x-1"
                        }`}
                    />
                  </button>
                )}
              </div>

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
};
