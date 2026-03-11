// PERF-RERENDER: Wrapped in React.memo with useCallback for all handlers to prevent re-renders when parent updates

"use client";

import React, { memo, useCallback } from "react";
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
  onDelete?: (id: string) => void;
  onTogglePrivate?: (id: string, nextPrivate: boolean) => void;
  isShared?: boolean;
  formatCurrency: (
    value: number,
    options?: Intl.NumberFormatOptions
  ) => string;
  currencySymbol: string;
}

const formatSheetMeta = (timestamp: number) =>
  new Date(timestamp).toLocaleString("en-IN", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const TransactionActionSheet = memo(({
  isOpen,
  tx,
  hasEdit,
  confirmDelete,
  setConfirmDelete,
  onClose,
  onEdit,
  onDelete = undefined,
  isShared = false,
  formatCurrency,
  currencySymbol,
}: TransactionActionSheetProps) => {
  const handleEditClick = useCallback(() => {
    if (onEdit && tx) {
      onEdit(tx.id);
      onClose();
    }
  }, [onEdit, tx, onClose]);

  const handleDeleteClick = useCallback(() => {
    if (!tx || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(tx.id);
    onClose();
  }, [confirmDelete, onDelete, onClose, setConfirmDelete, tx]);

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  if (!isOpen || !tx) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="transaction-action-sheet-overlay"
        aria-label="Close transaction actions"
        className="fixed inset-0 z-40 bg-[var(--kk-void)]/40 backdrop-blur-sm sm:hidden transform-gpu"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={handleOverlayClick}
      />
      <motion.div
        key="transaction-action-sheet-panel"
        className="fixed inset-x-0 bottom-0 z-50 bg-white sm:hidden"
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-label={`Actions for ${tx.item}`}
      >
        <div className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div
            className="kk-radius-top-xl border border-[var(--kk-smoke)] bg-white p-4 shadow-[var(--kk-shadow-lg)]"
            onClick={handlePanelClick}
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
                <span className="kk-currency">{currencySymbol}</span>
                {formatCurrency(tx.amount)}
              </div>
            </div>

            {(hasEdit && onEdit) || onDelete ? (
              <div
                className={`mt-4 grid gap-2 ${hasEdit && onEdit && onDelete ? "grid-cols-2" : "grid-cols-1"}`}
              >
                {hasEdit && onEdit && (
                  <button
                    type="button"
                    className="kk-btn-secondary flex items-center justify-center gap-2"
                    onClick={handleEditClick}
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className={`kk-btn-secondary flex items-center justify-center gap-2 ${confirmDelete
                      ? "border-[var(--kk-ember)] text-[var(--kk-ember)]"
                      : ""
                      }`}
                    onClick={handleDeleteClick}
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
            ) : null}
            {isShared && (
              <div className="mt-3 bg-[var(--kk-smoke)] p-2 rounded-lg text-center text-[10px] text-[var(--kk-ash)] uppercase tracking-wider font-bold">
                Already shared with partner
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

TransactionActionSheet.displayName = "TransactionActionSheet";
