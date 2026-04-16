"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import dynamic from "next/dynamic";

const SyncManager = dynamic(() => import("@/src/components/SyncManager").then(m => ({ default: m.SyncManager })), { ssr: false });

interface SyncOverlayProps {
    isOpen: boolean;
    onClose: () => void;
    onSyncComplete: () => void;
}

export const SyncOverlay = React.memo(({ isOpen, onClose, onSyncComplete }: SyncOverlayProps) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-[var(--kk-paper)] overflow-auto overscroll-contain kk-slide-in-right">
            <div className="mx-auto h-full w-full max-w-4xl flex flex-col">
                <header className="z-20 shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/90 px-5 py-4 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={onClose} className="kk-icon-btn kk-icon-btn-lg">
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div className="text-2xl font-semibold font-[family:var(--font-display)]">Household</div>
                    </div>
                </header>
                <div className="flex-1">
                    <SyncManager onSyncComplete={onSyncComplete} />
                </div>
            </div>
        </div>
    );
});

SyncOverlay.displayName = "SyncOverlay";
