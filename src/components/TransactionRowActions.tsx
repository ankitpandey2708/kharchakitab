// PERF-RERENDER: Wrapped in React.memo to prevent re-renders when parent list scrolls/updates but row actions stay the same

"use client";

import { memo, useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, Trash2 } from "lucide-react";

interface TransactionRowActionsProps {
  itemLabel: string;
  transactionId: string;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const TransactionRowActions = memo(({
  itemLabel,
  transactionId,
  onEdit,
  onDelete,
}: TransactionRowActionsProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = useCallback(() => {
    if (!onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(transactionId);
    setConfirmDelete(false);
  }, [confirmDelete, onDelete, transactionId]);

  const handleEditClick = useCallback(() => {
    if (onEdit) {
      setConfirmDelete(false);
      onEdit(transactionId);
    }
  }, [onEdit, transactionId]);

  const handleMouseLeave = useCallback(() => {
    setConfirmDelete(false);
  }, []);

  return (
    <div
      // PERF-ANIMATION: opacity transitions are GPU-accelerated, adding will-change
      className="hidden flex-none items-center justify-end gap-1 opacity-0 transition-opacity will-change-opacity sm:flex sm:w-[76px] sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
      onMouseLeave={handleMouseLeave}
    >
      {onEdit ? (
        <button
          type="button"
          onClick={handleEditClick}
          aria-label={`Edit ${itemLabel} entry`}
          className="kk-icon-btn kk-icon-btn-ghost hidden h-8 w-8 sm:inline-flex sm:h-9 sm:w-9"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : (
        <div className="hidden sm:block sm:h-9 sm:w-9 flex-none" aria-hidden="true" />
      )}
      {onDelete ? (
        <button
          type="button"
          onClick={handleDeleteClick}
          aria-label={
            confirmDelete
              ? `Confirm remove ${itemLabel} entry`
              : `Remove ${itemLabel} entry`
          }
          className={`kk-icon-btn kk-icon-btn-ghost h-8 w-8 sm:h-9 sm:w-9 ${confirmDelete ? "text-[var(--kk-ember)]" : "kk-icon-btn-danger"
            }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {confirmDelete ? (
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
      ) : (
        <div className="hidden h-8 w-8 flex-none sm:block sm:h-9 sm:w-9" aria-hidden="true" />
      )}
    </div>
  );
});

TransactionRowActions.displayName = "TransactionRowActions";
