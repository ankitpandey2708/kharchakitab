import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getFingerprintData = async () => {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result;
  } catch {
    return null;
  }
};

/**
 * Device name derivation — no third-party libraries.
 *
 * Priority:
 *   1. UA Client Hints (navigator.userAgentData) — Chrome/Edge/Android
 *      - On Android: tries high-entropy 'model' hint for actual device name
 *   2. Classic navigator.userAgent string — Firefox, Safari, legacy
 *
 * Format: "{Device Type}" — e.g. "iPhone", "Pixel 8 Pro", "Mac", "Windows PC"
 * Clean, human-readable. No screen resolution, no touch flags, no browser version noise.
 */

type NavigatorWithUAData = Navigator & {
  userAgentData?: {
    platform: string;
    mobile: boolean;
    getHighEntropyValues?: (hints: string[]) => Promise<Record<string, string>>;
  };
};

function getBrowserName(ua: string): string {
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "";
}

function deviceFromPlatform(platform: string, isMobile: boolean): string {
  switch (platform) {
    case "iOS":
      return isMobile ? "iPhone" : "iPad";
    case "Android":
      return isMobile ? "Android Phone" : "Android Tablet";
    case "macOS":
      return "Mac";
    case "Windows":
      return "Windows PC";
    case "Linux":
      return "Linux PC";
    case "Chrome OS":
      return "Chromebook";
    default:
      return platform || "Device";
  }
}

function deviceFromUA(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android Phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Device";
}

export async function deriveDeviceName(): Promise<string> {
  if (typeof navigator === "undefined") return "Device";

  const nav = navigator as NavigatorWithUAData;
  const uaData = nav.userAgentData;

  if (uaData?.platform) {
    let device = deviceFromPlatform(uaData.platform, uaData.mobile ?? false);

    // On Android, try to get the actual device model name (e.g. "Pixel 8 Pro")
    if (uaData.platform === "Android" && typeof uaData.getHighEntropyValues === "function") {
      try {
        const hints = await uaData.getHighEntropyValues(["model"]);
        if (hints.model) device = hints.model;
      } catch {
        // Permission denied or not supported — keep platform-derived name
      }
    }

    const browser = getBrowserName(navigator.userAgent);
    return browser ? `${device} • ${browser}` : device;
  }

  // Fallback: classic UA string (Firefox, Safari, older browsers)
  const device = deviceFromUA(navigator.userAgent);
  const browser = getBrowserName(navigator.userAgent);
  return browser ? `${device} • ${browser}` : device;
}
