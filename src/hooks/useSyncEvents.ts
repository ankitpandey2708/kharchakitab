// PERF-RERENDER: Wrapped return object in useMemo to prevent unnecessary re-renders in consuming components

import { useEffect, useMemo, useState, useCallback } from "react";
import { syncEvents } from "@/src/services/sync/syncEvents";

/**
 * S5.T9: React hook to listen to sync events and trigger UI refresh
 */
export const useSyncEvents = (partnerDeviceId?: string) => {
    const [syncInProgress, setSyncInProgress] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Use useCallback for state setters to ensure stable references
    const handleSyncStart = useCallback((data: { partnerDeviceId?: string }) => {
        if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
            setSyncInProgress(true);
            setSyncError(null);
        }
    }, [partnerDeviceId]);

    const handleSyncComplete = useCallback((data: { partnerDeviceId?: string }) => {
        if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
            setSyncInProgress(false);
            setLastSyncTime(Date.now());
        }
    }, [partnerDeviceId]);

    const handleSyncError = useCallback((data: { partnerDeviceId?: string; error?: string }) => {
        if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
            setSyncInProgress(false);
            setSyncError(data?.error ?? "Unknown error");
        }
    }, [partnerDeviceId]);

    const handleSyncRefresh = useCallback((data: { partnerDeviceId?: string }) => {
        if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
            // Trigger a re-render to refresh transaction lists
            setRefreshTrigger((prev) => prev + 1);
        }
    }, [partnerDeviceId]);

    useEffect(() => {
        const unsubStart = syncEvents.on("sync:start", handleSyncStart);
        const unsubComplete = syncEvents.on("sync:complete", handleSyncComplete);
        const unsubError = syncEvents.on("sync:error", handleSyncError);
        const unsubRefresh = syncEvents.on("sync:refresh", handleSyncRefresh);

        return () => {
            unsubStart();
            unsubComplete();
            unsubError();
            unsubRefresh();
        };
    }, [handleSyncStart, handleSyncComplete, handleSyncError, handleSyncRefresh]);

    return useMemo(() => ({
        syncInProgress,
        syncError,
        lastSyncTime,
        refreshTrigger,
    }), [syncInProgress, syncError, lastSyncTime, refreshTrigger]);
};
