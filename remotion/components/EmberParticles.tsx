import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { COLORS } from "../constants";

interface Particle {
  x: number;
  startY: number;
  size: number;
  speed: number;
  drift: number;
  phase: number;
  color: string;
}

const SEED_PARTICLES: Particle[] = Array.from({ length: 18 }).map((_, i) => {
  const pseudo = ((i * 7919 + 104729) % 1000) / 1000;
  const pseudo2 = ((i * 6271 + 32749) % 1000) / 1000;
  const pseudo3 = ((i * 3571 + 99991) % 1000) / 1000;
  return {
    x: pseudo * 1080,
    startY: 1920 + pseudo2 * 200,
    size: 3 + pseudo3 * 6,
    speed: 1.5 + pseudo * 2.5,
    drift: (pseudo2 - 0.5) * 60,
    phase: pseudo3 * 200,
    color:
      i % 3 === 0
        ? COLORS.ember
        : i % 3 === 1
          ? COLORS.saffron
          : COLORS.emberGlow,
  };
});

export const EmberParticles: React.FC<{ fadeIn?: number }> = ({
  fadeIn = 0,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [fadeIn, fadeIn + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none", zIndex: 2 }}>
      {SEED_PARTICLES.map((p, i) => {
        const t = (frame + p.phase) * p.speed;
        const y = p.startY - (t % (1920 + 400));
        const x =
          p.x + Math.sin(((frame + p.phase) * 0.04 + i) * 0.8) * p.drift;
        const particleOpacity = interpolate(
          y,
          [-100, 200, 1400, 1920],
          [0, 0.8, 0.8, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: p.size,
              height: p.size,
              borderRadius: "50%",
              background: p.color,
              opacity: particleOpacity * 0.7,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
