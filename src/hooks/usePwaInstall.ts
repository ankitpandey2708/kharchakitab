"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

import { LS } from "@/src/config/storageKeys";

const DISMISS_KEY = LS.INSTALL_DISMISSED;

export function usePwaInstall() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode) — never show
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      // Only show if user hasn't dismissed this month
      const dismissed = window.localStorage.getItem(DISMISS_KEY);
      if (dismissed) {
        const n = new Date();
        const now = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
        if (dismissed === now) return;
      }
      setCanPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const promptInstall = useCallback(async () => {
    const prompt = deferredPrompt.current;
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferredPrompt.current = null;
    setCanPrompt(false);
    return outcome;
  }, []);

  const dismiss = useCallback(() => {
    setCanPrompt(false);
    deferredPrompt.current = null;
    const n = new Date();
    window.localStorage.setItem(DISMISS_KEY, `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`);
  }, []);

  return { canPrompt, promptInstall, dismiss };
}
