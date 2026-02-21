import { useEffect, useMemo, useState } from "react";
import { syncEvents } from "@/src/services/sync/syncEvents";

/**
 * S5.T9: React hook to listen to sync events and trigger UI refresh
 */
export const useSyncEvents = (partnerDeviceId?: string) => {
    const [syncInProgress, setSyncInProgress] = useState(false);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    useEffect(() => {
        const unsubStart = syncEvents.on("sync:start", (data) => {
            if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
                setSyncInProgress(true);
                setSyncError(null);
            }
        });

        const unsubComplete = syncEvents.on("sync:complete", (data) => {
            if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
                setSyncInProgress(false);
                setLastSyncTime(Date.now());
            }
        });

        const unsubError = syncEvents.on("sync:error", (data) => {
            if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
                setSyncInProgress(false);
                setSyncError(data?.error ?? "Unknown error");
            }
        });

        const unsubRefresh = syncEvents.on("sync:refresh", (data) => {
            if (!partnerDeviceId || data?.partnerDeviceId === partnerDeviceId) {
                // Trigger a re-render to refresh transaction lists
                setRefreshTrigger((prev) => prev + 1);
            }
        });

        return () => {
            unsubStart();
            unsubComplete();
            unsubError();
            unsubRefresh();
        };
    }, [partnerDeviceId]);

    return useMemo(() => ({
        syncInProgress,
        syncError,
        lastSyncTime,
        refreshTrigger,
    }), [syncInProgress, syncError, lastSyncTime, refreshTrigger]);
};
