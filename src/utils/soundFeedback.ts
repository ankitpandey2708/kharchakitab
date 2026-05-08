import type { CurrencyCode } from "@/src/utils/money";
import { LS } from "@/src/config/storageKeys";

// Sprite offsets within /sounds/sounds.mp3
// Order: coin → chaching → atm → money
const SPRITE: Record<number, { start: number; duration: number }> = {
  1: { start: 0,     duration: 1.5   },  // coin
  2: { start: 1.5,   duration: 1.2   },  // chaching
  3: { start: 2.7,   duration: 1.259 },  // atm
  4: { start: 3.959, duration: 1.2   },  // money
};

let audioCtx: AudioContext | null = null;
let spriteBuffer: AudioBuffer | null = null;

async function getSpriteBuffer(): Promise<AudioBuffer | null> {
  if (spriteBuffer) return spriteBuffer;
  try {
    if (!audioCtx || audioCtx.state === "closed") {
      audioCtx = new AudioContext();
    }
    const res = await fetch("/sounds/sounds.mp3");
    const arrayBuffer = await res.arrayBuffer();
    spriteBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return spriteBuffer;
  } catch {
    return null;
  }
}

const getTier = (amount: number, currency: CurrencyCode): number => {
  const inr = currency === "INR" ? amount : amount * 80;
  if (inr < 50) return 1;
  if (inr < 500) return 2;
  if (inr < 2000) return 3;
  return 4;
};

export const playMoneySound = (amount: number, currency: CurrencyCode): void => {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(LS.SOUND_ENABLED) === "false") return;

  const tier = getTier(amount, currency);
  const { start, duration } = SPRITE[tier];

  getSpriteBuffer().then(buffer => {
    if (!buffer || !audioCtx) return;
    if (audioCtx.state === "suspended") audioCtx.resume();
    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioCtx.destination);
    source.start(0, start, duration);
  }).catch(() => {});
};
