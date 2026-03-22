import type { Transaction } from "@/src/types";

/**
 * The standard label used for temporary "pending" transactions 
 * while they are being processed by AI (Voice, Text, or Receipt).
 */
export const TRANSACTION_PENDING_LABEL = "Processing …";

/**
 * Checks if a transaction is a temporary "Processing" placeholder.
 * This covers both the single character ellipsis (…) and three periods (...).
 */
export const isProcessingTransaction = (tx: Transaction): boolean => {
  return tx.item === TRANSACTION_PENDING_LABEL;
};
