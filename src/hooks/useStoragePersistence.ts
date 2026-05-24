"use client";

import { useEffect, useState } from "react";

export interface StorageStatus {
  isPersisted: boolean | null;   // null = not yet checked
  usagePercent: number | null;   // null = not yet checked
  usageMB: number | null;
  quotaMB: number | null;
  isNearFull: boolean;           // true when usage > 80%
}

/**
 * Requests persistent storage from the browser and monitors storage quota.
 *
 * WHY THIS EXISTS:
 * Without navigator.storage.persist(), IndexedDB is classified as "best-effort"
 * storage. Chrome on Android evicts best-effort storage after ~21 days of
 * inactivity OR when the device runs low on space — causing all expense data
 * to disappear silently.
 *
 * Calling persist() on an installed PWA on Android Chrome is almost always
 * granted automatically, turning the storage into "persistent" which is never
 * evicted by the browser.
 */
export function useStoragePersistence(): StorageStatus {
  const [status, setStatus] = useState<StorageStatus>({
    isPersisted: null,
    usagePercent: null,
    usageMB: null,
    quotaMB: null,
    isNearFull: false,
  });

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.storage) return;

    const run = async () => {
      // Step 1: Request persistent storage
      let isPersisted = false;
      try {
        // Check current state first
        isPersisted = await navigator.storage.persisted();
        if (!isPersisted) {
          // Request persistence — Chrome on Android grants this for installed PWAs
          isPersisted = await navigator.storage.persist();
        }
      } catch {
        // Browser may not support persist() — not a fatal error
      }

      // Step 2: Check storage quota
      let usagePercent: number | null = null;
      let usageMB: number | null = null;
      let quotaMB: number | null = null;
      let isNearFull = false;

      try {
        const estimate = await navigator.storage.estimate();
        const usage = estimate.usage ?? 0;
        const quota = estimate.quota ?? 0;

        if (quota > 0) {
          usagePercent = Math.round((usage / quota) * 100);
          usageMB = Math.round(usage / (1024 * 1024));
          quotaMB = Math.round(quota / (1024 * 1024));
          isNearFull = usagePercent > 80;
        }
      } catch {
        // estimate() not supported — skip
      }

      setStatus({ isPersisted, usagePercent, usageMB, quotaMB, isNearFull });
    };

    void run();
  }, []);

  return status;
}
