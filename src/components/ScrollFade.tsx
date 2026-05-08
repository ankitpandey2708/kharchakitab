"use client";

import React, { useState } from "react";

interface ScrollFadeProps {
  children: React.ReactNode;
  className?: string;
}

export const ScrollFade = React.memo(({ children, className }: ScrollFadeProps) => {
  const [atEnd, setAtEnd] = useState(false);
  return (
    <div
      onScroll={(e) => {
        const el = e.currentTarget;
        setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
      }}
      className={`overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden${className ? ` ${className}` : ""}`}
      style={atEnd ? undefined : {
        maskImage: "linear-gradient(to right, black 70%, transparent 100%)",
        WebkitMaskImage: "linear-gradient(to right, black 70%, transparent 100%)",
      }}
    >
      {children}
    </div>
  );
});
ScrollFade.displayName = "ScrollFade";
