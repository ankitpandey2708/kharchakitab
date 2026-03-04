import React from "react";
import { AbsoluteFill } from "remotion";
import { COLORS } from "../constants";

export const PaperTexture: React.FC<{ opacity?: number }> = ({
  opacity = 0.035,
}) => {
  return (
    <>
      {/* Noise grain */}
      <AbsoluteFill
        style={{
          opacity,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      {/* Subtle vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at center, transparent 50%, ${COLORS.parchment} 100%)`,
          opacity: 0.4,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
    </>
  );
};
