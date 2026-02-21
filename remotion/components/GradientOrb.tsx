import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../constants";

interface GradientOrbProps {
  color: "ember" | "saffron" | "ink";
  size?: number;
  left?: string;
  top?: string;
  delay?: number;
  blur?: number;
}

export const GradientOrb: React.FC<GradientOrbProps> = ({
  color,
  size = 300,
  left = "50%",
  top = "50%",
  delay = 0,
  blur = 80,
}) => {
  const frame = useCurrentFrame();
  const cycle = 240;
  const t = (frame + delay) % cycle;

  const scale = interpolate(t, [0, cycle / 2, cycle], [1, 1.12, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const drift = interpolate(t, [0, cycle / 2, cycle], [0, 8, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const opacity = interpolate(t, [0, cycle / 2, cycle], [0.35, 0.55, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const orbColor =
    color === "ember"
      ? COLORS.emberGlow
      : color === "saffron"
        ? COLORS.saffron
        : COLORS.ink;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: `translate(-50%, -50%) scale(${scale}) translateY(${drift}px)`,
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${orbColor} 0%, transparent 70%)`,
        filter: `blur(${blur}px)`,
        opacity: color === "ink" ? 0.08 : opacity,
        pointerEvents: "none",
      }}
    />
  );
};
