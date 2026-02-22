import { useCallback, useEffect, useState } from "react";

interface UseMobileSheetOptions {
  onOpenChange?: (isOpen: boolean) => void;
}

export const useMobileSheet = ({ onOpenChange }: UseMobileSheetOptions = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openSheet = useCallback((id: string) => {
    setActiveId(id);
    setConfirmDelete(false);
    setIsOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    setIsOpen(false);
    setConfirmDelete(false);
    setActiveId(null);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeSheet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeSheet, isOpen]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    return () => {
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  return {
    isOpen,
    activeId,
    confirmDelete,
    setConfirmDelete,
    openSheet,
    closeSheet,
  };
};
