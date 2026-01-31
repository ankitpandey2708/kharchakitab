"use client";

import React from "react";
import { motion } from "framer-motion";
import { MoreHorizontal } from "lucide-react";
import type { Transaction } from "@/src/types";
import { PAYMENT_ICON_MAP, type PaymentKey } from "@/src/config/payments";
import { CategoryIcon } from "@/src/components/CategoryIcon";
import { TransactionRowActions } from "@/src/components/TransactionRowActions";

type MetaVariant = "date" | "time";

interface TransactionRowProps {
  tx: Transaction;
  index: number;
  metaVariant: MetaVariant;
  hasEdit: boolean;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenMobileSheet: (id: string) => void;
  formatCurrency: (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => string;
  amountMaxWidthClass?: string;
  isProcessing?: boolean;
  ownerLabel?: string;
  showActions?: boolean;
}

const getPaymentLabel = (paymentMethod: Transaction["paymentMethod"]) =>
  paymentMethod === "upi"
    ? "UPI"
    : paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1);

const getMetaLabel = (timestamp: number, variant: MetaVariant) => {
  const date = new Date(timestamp);
  if (variant === "time") {
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
};

export const TransactionRow = React.memo(
  ({
    tx,
    index,
    metaVariant,
    hasEdit,
    onEdit,
    onDelete,
    onOpenMobileSheet,
    formatCurrency,
    amountMaxWidthClass = "max-w-[24vw]",
    isProcessing = false,
    ownerLabel,
    showActions = true,
  }: TransactionRowProps) => {
    // Mobile UX: only the "..." button should be actionable; the row itself is not clickable.
    const isClickable = false;

    const paymentKey = Object.prototype.hasOwnProperty.call(
      PAYMENT_ICON_MAP,
      tx.paymentMethod
    )
      ? (tx.paymentMethod as PaymentKey)
      : "unknown";
    const PaymentIcon = PAYMENT_ICON_MAP[paymentKey];
    const paymentLabel = getPaymentLabel(tx.paymentMethod);
    const metaLabel = getMetaLabel(tx.timestamp, metaVariant);

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.28, delay: index * 0.035 }}
        className={`group relative flex items-center justify-between gap-3 overflow-hidden kk-radius-md border border-[var(--kk-smoke)] bg-white p-4 pl-5 pr-4 transition-all hover:border-[var(--kk-smoke-heavy)] hover:shadow-[var(--kk-shadow-sm)] ${isClickable ? "cursor-pointer active:scale-[0.995]" : ""
          }`}
        role={isClickable ? "button" : "listitem"}
        tabIndex={isClickable ? 0 : -1}
      >
        <div className="absolute left-0 top-3 bottom-3 w-[3px] rounded-r-sm bg-gradient-to-b from-[var(--kk-ember)] to-[var(--kk-saffron)] opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="flex flex-1 min-w-0 items-center gap-3">
          <div className="kk-category-icon h-9 w-9 flex-none shrink-0">
            <CategoryIcon category={tx.category} className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            {isProcessing ? (
              <div className="space-y-2">
                <div className="kk-skeleton h-4 w-32" />
                <div className="flex items-center gap-2">
                  <div className="kk-skeleton h-3 w-16" />
                  <div className="kk-skeleton h-3 w-10" />
                </div>
              </div>
            ) : (
              <>
                <div className="truncate font-medium text-[var(--kk-ink)]">
                  {tx.item}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 kk-meta">
                  <span>{metaLabel}</span>
                  {ownerLabel && (
                    <span className="kk-pill kk-pill-muted">{ownerLabel}</span>
                  )}
                  <span className="kk-pill">
                    <PaymentIcon
                      aria-label={paymentLabel}
                      title={paymentLabel}
                      className="h-3 w-3"
                    />
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2">
          {isProcessing ? (
            <div className="kk-skeleton h-5 w-14" />
          ) : (
            <div
              className={`kk-amount ${amountMaxWidthClass} overflow-hidden text-ellipsis whitespace-nowrap text-right text-[clamp(0.85rem,3.8vw,1rem)] sm:max-w-none sm:text-base`}
            >
              <span className="kk-rupee">₹</span>
              {formatCurrency(tx.amount)}
            </div>
          )}

          {showActions && (
            <>
              <TransactionRowActions
                itemLabel={tx.item}
                transactionId={tx.id}
                onEdit={hasEdit ? onEdit : undefined}
                onDelete={onDelete}
              />

              {!isProcessing && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenMobileSheet(tx.id);
                  }}
                  aria-label={`More actions for ${tx.item}`}
                  className="kk-icon-btn kk-icon-btn-ghost h-8 w-8 kk-mobile-only"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              )}
            </>
          )}
        </div>
      </motion.div>
    );
  }
);

TransactionRow.displayName = "TransactionRow";
