"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "kk_install_dismissed";

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
        const dismissedMonth = dismissed.slice(0, 7); // "2026-03"
        const now = new Date().toISOString().slice(0, 7);
        if (dismissedMonth === now) return;
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
    window.localStorage.setItem(DISMISS_KEY, new Date().toISOString());
  }, []);

  return { canPrompt, promptInstall, dismiss };
}
