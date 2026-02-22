import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../constants";

interface LedgerLinesProps {
  /** Show the vertical red ruling margin line */
  showMargin?: boolean;
  /** Horizontal line spacing in px */
  lineSpacing?: number;
  /** Fade-in start frame */
  fadeIn?: number;
  /** Margin X position in px */
  marginX?: number;
}

export const LedgerLines: React.FC<LedgerLinesProps> = ({
  showMargin = true,
  lineSpacing = 56,
  fadeIn = 0,
  marginX = 100,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [fadeIn, fadeIn + 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineCount = Math.ceil(1920 / lineSpacing);

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none", zIndex: 0 }}>
      {/* Horizontal ruling lines */}
      {Array.from({ length: lineCount }).map((_, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: i * lineSpacing,
            left: 0,
            right: 0,
            height: 1,
            background: COLORS.rulingRedFaint,
            opacity: 0.5,
          }}
        />
      ))}

      {/* Vertical red margin line — like a real khata */}
      {showMargin && (
        <>
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: marginX,
              width: 2,
              background: COLORS.rulingRed,
              opacity: 0.2,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: marginX + 8,
              width: 1,
              background: COLORS.rulingRed,
              opacity: 0.1,
            }}
          />
        </>
      )}
    </AbsoluteFill>
  );
};
