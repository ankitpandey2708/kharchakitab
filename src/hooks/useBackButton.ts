import { useEffect, useRef } from "react";

export const useBackButton = (isActive: boolean, onBack: () => void) => {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isActive) return;

    const handlePopState = () => {
      onBackRef.current();
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (window.history.state?.hasOwnProperty("index")) {
        window.history.back();
      }
    };
  }, [isActive]);
};
