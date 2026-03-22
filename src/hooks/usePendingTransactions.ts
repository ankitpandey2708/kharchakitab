import { useCallback, useState } from "react";
import type { Transaction } from "@/src/types";

/**
 * Hook to manage temporary "pending" transactions in the UI.
 * These are placeholders used while background processing is active.
 */
export const usePendingTransactions = () => {
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);

  /**
   * Adds a new pending transaction with the given label.
   * Returns its unique temporary ID for later removal.
   */
  const addPending = useCallback((label: string) => {
    const pending: Transaction = {
      id: `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      amount: 0,
      item: label,
      category: "Other",
      paymentMethod: "unknown",
      timestamp: Date.now(),
      is_private: false,
    };
    
    setPendingTransactions((prev) => [pending, ...prev]);
    return pending.id;
  }, []);

  /**
   * Removes a pending transaction by its temporary ID.
   */
  const removePending = useCallback((id: string) => {
    setPendingTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, []);

  return {
    pendingTransactions,
    addPending,
    removePending,
  };
};
