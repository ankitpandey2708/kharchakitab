import type { CurrencyCode } from "@/src/utils/money";

const SOUND_FILES: Record<number, string> = {
  1: "/sounds/coin.mp3",
  2: "/sounds/chaching.mp3",
  3: "/sounds/money.mp3",
  4: "/sounds/atm.mp3",
  5: "/sounds/dramatic.mp3",
};

// Cache Audio elements so we don't re-create on every play
const audioCache = new Map<number, HTMLAudioElement>();

const getAudio = (tier: number): HTMLAudioElement => {
  let audio = audioCache.get(tier);
  if (!audio) {
    audio = new Audio(SOUND_FILES[tier]);
    audioCache.set(tier, audio);
  }
  return audio;
};

const getTier = (amount: number, currency: CurrencyCode): number => {
  const inr = currency === "INR" ? amount : amount * 80;
  if (inr < 50) return 1;
  if (inr < 500) return 2;
  if (inr < 2000) return 3;
  if (inr < 5000) return 4;
  return 5;
};

export const playMoneySound = (
  amount: number,
  currency: CurrencyCode,
): void => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("kk_sound_enabled") === "false") return;

  try {
    const tier = getTier(amount, currency);
    const audio = getAudio(tier);
    // Reset to start in case it's still playing from a previous transaction
    audio.currentTime = 0;
    void audio.play();

    // Tier 5: vibrate + visual screen shake for extra impact
    if (tier === 5) {
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
      // Visual shake (works on all devices)
      const root = document.documentElement;
      root.classList.remove("kk-shaking");
      void root.offsetHeight; // force reflow
      root.classList.add("kk-shaking");
      root.addEventListener(
        "animationend",
        () => root.classList.remove("kk-shaking"),
        { once: true },
      );
    }
  } catch {
    // Silently ignore — audio feedback is non-critical
  }
};
