import { useEffect } from "react";

export const useEscapeKey = (isActive: boolean, onEscape: () => void) => {
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onEscape();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onEscape]);
};
