const MASTER_KEY = "kk_notifications_master";

interface AlertsEnvironment {
  isSupported: boolean;
  isIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission;
}

export const getAlertsEnvironment = (): AlertsEnvironment => {
  if (typeof window === "undefined") {
    return {
      isSupported: false,
      isIos: false,
      isStandalone: false,
      permission: "default",
    };
  }

  const ua = window.navigator.userAgent ?? "";
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Boolean((window.navigator as any).standalone);
  const isSupported = "Notification" in window && "serviceWorker" in window.navigator;
  const permission = isSupported ? window.Notification.permission : "default";

  return { isSupported, isIos, isStandalone, permission };
};

const getAlertsStatus = (
  enabled: boolean,
  env: AlertsEnvironment
): "unsupported" | "disabled" | "blocked" | "enabled" => {
  if (!env.isSupported) return "unsupported";
  if (!enabled) return "disabled";
  if (env.permission === "denied") return "blocked";
  if (env.permission === "granted") return "enabled";
  return "disabled";
};

export const isAlertsReady = (enabled: boolean, env: AlertsEnvironment) => {
  if (!getMasterEnabled()) return false;
  if (!enabled || !env.isSupported) return false;
  if (env.permission !== "granted") return false;
  if (env.isIos && !env.isStandalone) return false;
  return true;
};

// ---------------------------------------------------------------------------
// Fix 1: Master toggle — gates ALL notification features
// ---------------------------------------------------------------------------

export const getMasterEnabled = (): boolean => {
  if (typeof window === "undefined") return false;
  const value = window.localStorage.getItem(MASTER_KEY);
  return value === null ? false : value === "true";
};

export const setMasterEnabled = (value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MASTER_KEY, value ? "true" : "false");
  // Mirror to SW so periodic/background sync can check it
  postMasterToSW(value);
};

const postMasterToSW = (enabled: boolean) => {
  navigator.serviceWorker?.controller?.postMessage({
    type: "SET_MASTER_ENABLED",
    enabled,
  });
};

// ---------------------------------------------------------------------------
// Fix 2: Centralized permission request + master gate
// ---------------------------------------------------------------------------

const requestNotificationPermission = async () => {
  if (typeof window === "undefined" || !("Notification" in window)) return "default";
  return window.Notification.requestPermission();
};

/**
 * Ensures browser permission is granted and master toggle is on.
 * Call this from any feature toggle-on flow instead of rolling your own.
 * Returns the resulting permission string.
 */
export const ensureNotificationsEnabled = async (): Promise<NotificationPermission> => {
  const env = getAlertsEnvironment();
  if (!env.isSupported) return "default";
  if (env.isIos && !env.isStandalone) return "default";

  if (env.permission !== "granted") {
    const permission = await requestNotificationPermission();
    if (permission !== "granted") return permission;
  }

  setMasterEnabled(true);
  return "granted";
};

// ---------------------------------------------------------------------------
// Fix 3: Revocation guidance
// ---------------------------------------------------------------------------

export const getBrowserPermissionHint = (): string | null => {
  const env = getAlertsEnvironment();
  if (env.permission !== "granted") return null;
  if (env.isIos) {
    return "To fully block notifications, go to Settings > KharchaKitab > Notifications and turn them off.";
  }
  return "To fully block notifications, click the lock icon in your browser's address bar and set Notifications to Block.";
};

/**
 * Create a feature-specific enabled/disabled toggle backed by localStorage.
 * Each notification feature (recurring, daily reminder, etc.) gets its own key.
 */
export const createFeatureToggle = (
  key: string,
  defaultValue = false
) => ({
  get: (): boolean => {
    if (typeof window === "undefined") return defaultValue;
    const value = window.localStorage.getItem(key);
    return value === null ? defaultValue : value === "true";
  },
  set: (value: boolean) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, value ? "true" : "false");
  },
});

// Pre-built toggles for existing features
const recurringToggle = createFeatureToggle("kk_alerts_enabled", false);
export const getAlertsEnabled = recurringToggle.get;
export const setAlertsEnabled = recurringToggle.set;


let swRegistration: ServiceWorkerRegistration | null = null;

const registerServiceWorker = async () => {
  if (typeof window === "undefined" || !("serviceWorker" in window.navigator)) return null;
  if (swRegistration) return swRegistration;
  swRegistration = await window.navigator.serviceWorker.register("/sw.js");
  return swRegistration;
};

export const registerPeriodicSync = async (tag: string, minInterval: number) => {
  try {
    const registration = await registerServiceWorker();
    if (!registration) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodic = (registration as any).periodicSync;
    if (!periodic) return;
    const status = await window.navigator.permissions.query({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: "periodic-background-sync" as any,
    });
    if (status.state === "granted") {
      await periodic.register(tag, { minInterval });
    }
  } catch {
    // Best-effort
  }
};

export const unregisterPeriodicSync = async (tag: string) => {
  try {
    const registration = await registerServiceWorker();
    if (!registration) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodic = (registration as any).periodicSync;
    if (periodic) {
      await periodic.unregister(tag);
    }
  } catch {
    // Best-effort
  }
};

export const registerBackgroundSync = async (tag: string) => {
  try {
    const registration = await registerServiceWorker();
    if (!registration) return;
    const syncManager = (registration as ServiceWorkerRegistration & { sync?: { register: (tag: string) => Promise<void> } }).sync;
    if (syncManager) {
      await syncManager.register(tag);
    }
  } catch {
    // Best-effort
  }
};

export const postToSW = async (message: Record<string, unknown>) => {
  const registration = await registerServiceWorker();
  if (!registration) return;
  // Always include master state so SW can gate notifications
  const payload = { ...message, _masterEnabled: getMasterEnabled() };
  const worker = navigator.serviceWorker.controller ?? registration.active;
  if (!worker) {
    try {
      const ready = await navigator.serviceWorker.ready;
      ready.active?.postMessage(payload);
    } catch {
      // ignore
    }
    return;
  }
  worker.postMessage(payload);
};

export const sendTestNotification = async () => {
  await postToSW({ type: "TEST_NOTIFICATION" });
};
