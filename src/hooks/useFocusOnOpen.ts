import { useEffect, type RefObject } from "react";

export const useFocusOnOpen = (isOpen: boolean, ref: RefObject<HTMLInputElement | null>) => {
  useEffect(() => {
    if (isOpen) setTimeout(() => ref.current?.focus(), 60);
  }, [isOpen, ref]);
};
