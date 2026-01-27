"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import type { Transaction } from "@/src/types";

interface TransactionActionSheetProps {
  isOpen: boolean;
  tx: Transaction | null;
  hasEdit: boolean;
  confirmDelete: boolean;
  setConfirmDelete: (value: boolean) => void;
  onClose: () => void;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
  formatCurrency: (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => string;
}

const formatSheetMeta = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const TransactionActionSheet = ({
  isOpen,
  tx,
  hasEdit,
  confirmDelete,
  setConfirmDelete,
  onClose,
  onEdit,
  onDelete,
  formatCurrency,
}: TransactionActionSheetProps) => {
  if (!isOpen || !tx) return null;

  return (
    <AnimatePresence>
      <motion.button
        key="transaction-action-sheet-overlay"
        type="button"
        aria-label="Close transaction actions"
        className="fixed inset-0 z-40 bg-black/30 sm:hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
      />
      <motion.div
        key="transaction-action-sheet-panel"
        className="fixed inset-x-0 bottom-0 z-50 sm:hidden"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${tx.item}`}
      >
        <div className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div
            className="kk-radius-top-xl border border-[var(--kk-smoke)] bg-white p-4 shadow-[var(--kk-shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[var(--kk-ink)]">
                  {tx.item}
                </div>
                <div className="mt-1 text-xs text-[var(--kk-ash)]">
                  {formatSheetMeta(tx.timestamp)}
                </div>
              </div>
              <div className="kk-amount text-right text-base sm:text-lg">
                <span className="kk-rupee">₹</span>
                {formatCurrency(tx.amount)}
              </div>
            </div>

            <div
              className={`mt-4 grid gap-2 ${
                hasEdit ? "grid-cols-2" : "grid-cols-1"
              }`}
            >
              {hasEdit && onEdit && (
                <button
                  type="button"
                  className="kk-btn-secondary flex items-center justify-center gap-2"
                  onClick={() => {
                    onEdit(tx.id);
                    onClose();
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              )}
              <button
                type="button"
                className={`kk-btn-secondary flex items-center justify-center gap-2 ${
                  confirmDelete
                    ? "border-[var(--kk-ember)] text-[var(--kk-ember)]"
                    : ""
                }`}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true);
                    return;
                  }
                  onDelete(tx.id);
                  onClose();
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
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
