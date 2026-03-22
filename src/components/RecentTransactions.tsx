"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Transaction } from "@/src/types";
import { TransactionRow } from "@/src/components/TransactionRow";
import { isProcessingTransaction } from "@/src/utils/transactions";

interface RecentTransactionsProps {
    pendingTransactions?: Transaction[];
    transactions: Transaction[];
    identity: { device_id: string } | null;
    partnerName?: string;
    hasEdit: boolean;
    onViewAll?: () => void;
    onEdit?: (id: string) => void;
    onDelete?: (id: string) => void;
    onOpenMobileSheet?: (id: string) => void;
    currencySymbol: string;
    formatCurrency: (amount: number) => string;
}

const canEditTransaction = (tx: Transaction, identity: { device_id: string } | null): boolean => {
    return !identity || tx.owner_device_id === identity.device_id;
};

export const RecentTransactions = React.memo(({
    pendingTransactions = [],
    transactions,
    identity,
    partnerName,
    hasEdit,
    onEdit,
    onDelete,
    onOpenMobileSheet,
    currencySymbol,
    formatCurrency,
}: RecentTransactionsProps) => {
    const recentTransactions = useMemo(
        () => [...pendingTransactions, ...transactions].slice(0, 5),
        [pendingTransactions, transactions]
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.08 }}
            className="kk-card p-5"
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="kk-label">Last 5 txns</div>
                </div>
                <div className="flex items-center gap-3">
                    {/* {onViewAll && (
                        <button
                            type="button"
                            onClick={onViewAll}
                            className="kk-btn-secondary kk-btn-compact"
                        >
                            <BarChart3 className="h-3.5 w-3.5" />
                            View all
                        </button>
                    )} */}
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {recentTransactions.length === 0 ? (
                    <div className="py-6 text-center text-sm text-[var(--kk-ash)]">
                        No recent transactions
                    </div>
                ) : (
                    <AnimatePresence mode="popLayout">
                        {recentTransactions.map((tx, index) => {
                            const processing = isProcessingTransaction(tx);
                            const rowKey = tx.id || `recent-${index}`;
                            const date = new Date(tx.timestamp);
                            const day = String(date.getDate()).padStart(2, "0");
                            const month = date
                                .toLocaleDateString("en-IN", { month: "short" })
                                .toUpperCase();
                            const label = `${day} ${month}`;
                            const canEdit = canEditTransaction(tx, identity);
                            return (
                                <TransactionRow
                                    key={rowKey}
                                    tx={tx}
                                    index={index}
                                    metaVariant="date"
                                    metaLabelOverride={label}
                                    metaLabelClassName="kk-label text-[var(--kk-ember)]"
                                    ownerLabel={identity && partnerName ? (tx.owner_device_id === identity.device_id ? "Me" : partnerName) : undefined}
                                    hasEdit={hasEdit && canEdit}
                                    onEdit={hasEdit && canEdit && onEdit ? () => onEdit(tx.id) : undefined}
                                    onDelete={canEdit && onDelete ? () => onDelete(tx.id) : undefined}
                                    onOpenMobileSheet={canEdit && onOpenMobileSheet ? () => onOpenMobileSheet(tx.id) : undefined}
                                    formatCurrency={formatCurrency}
                                    currencySymbol={currencySymbol}
                                    amountMaxWidthClass="max-w-[24vw]"
                                    isProcessing={processing}
                                    showActions={!processing}
                                />
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </motion.div>
    );
});

RecentTransactions.displayName = "RecentTransactions";
