import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Pencil, Trash2 } from "lucide-react";

interface TransactionRowActionsProps {
  itemLabel: string;
  transactionId: string;
  onEdit?: (id: string) => void;
  onDelete: (id: string) => void;
}

export const TransactionRowActions = ({
  itemLabel,
  transactionId,
  onEdit,
  onDelete,
}: TransactionRowActionsProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(transactionId);
    setConfirmDelete(false);
  };

  return (
    <div
      className="hidden flex-none items-center justify-end gap-1 opacity-0 transition-opacity sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100"
      onMouseLeave={() => setConfirmDelete(false)}
    >
      {onEdit && (
        <button
          type="button"
          onClick={() => {
            setConfirmDelete(false);
            onEdit(transactionId);
          }}
          aria-label={`Edit ${itemLabel} entry`}
          className="kk-icon-btn kk-icon-btn-ghost hidden h-8 w-8 sm:inline-flex sm:h-9 sm:w-9"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={handleDeleteClick}
        aria-label={
          confirmDelete
            ? `Confirm remove ${itemLabel} entry`
            : `Remove ${itemLabel} entry`
        }
        className={`kk-icon-btn kk-icon-btn-ghost h-8 w-8 sm:h-9 sm:w-9 ${
          confirmDelete ? "text-[var(--kk-ember)]" : "kk-icon-btn-danger"
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
    </div>
  );
};
