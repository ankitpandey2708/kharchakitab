import React from "react";
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../constants";
import { GradientOrb } from "../components/GradientOrb";
import { PaperTexture } from "../components/PaperTexture";
import { EmberParticles } from "../components/EmberParticles";

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phase 1: Ink circle expands from center to reveal paper
  const inkReveal = interpolate(frame, [0, 40], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const revealRadius = inkReveal * 120; // percentage of diagonal

  // Phase 2: Rupee symbol burns through
  const rupeeScale = spring({
    frame: frame - 30,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.8 },
  });
  const rupeeOpacity = interpolate(frame, [30, 44], [0, 1], {
    extrapolateRight: "clamp",
  });
  const rupeeGlow = interpolate(frame, [30, 52, 72], [0, 1, 0.6], {
    extrapolateRight: "clamp",
  });

  // Phase 3: Brand name — staggered word reveal
  const kharchaX = spring({
    frame: frame - 52,
    fps,
    from: -80,
    to: 0,
    config: { damping: 15, stiffness: 80 },
  });
  const kharchaOp = interpolate(frame, [52, 66], [0, 1], {
    extrapolateRight: "clamp",
  });

  const kitabX = spring({
    frame: frame - 62,
    fps,
    from: 80,
    to: 0,
    config: { damping: 15, stiffness: 80 },
  });
  const kitabOp = interpolate(frame, [62, 76], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Phase 4: Tagline and accent line
  const lineWidth = spring({
    frame: frame - 82,
    fps,
    from: 0,
    to: 480,
    config: { damping: 20, stiffness: 50 },
  });

  const tagOp = interpolate(frame, [90, 108], [0, 1], {
    extrapolateRight: "clamp",
  });
  const tagY = spring({
    frame: frame - 90,
    fps,
    from: 30,
    to: 0,
    config: { damping: 18, stiffness: 80 },
  });

  // Decorative corner marks (like a real ledger page)
  const cornerOp = interpolate(frame, [12, 32], [0, 0.25], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.void }}>
      {/* Paper revealed through expanding circle */}
      <AbsoluteFill
        style={{
          backgroundColor: COLORS.paper,
          clipPath: `circle(${revealRadius}% at 50% 45%)`,
        }}
      >
        <PaperTexture />
        <GradientOrb color="ember" size={500} left="25%" top="20%" />
        <GradientOrb color="saffron" size={420} left="75%" top="75%" delay={80} />
        <GradientOrb color="ink" size={600} left="50%" top="100%" blur={120} />
      </AbsoluteFill>

      {/* Ember particles rising */}
      <EmberParticles fadeIn={25} />

      {/* Content layer */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 3,
        }}
      >
        {/* Decorative corner marks */}
        {[
          { top: 60, left: 60 },
          { top: 60, right: 60 },
          { bottom: 60, left: 60 },
          { bottom: 60, right: 60 },
        ].map((pos, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              ...pos,
              width: 40,
              height: 40,
              opacity: cornerOp,
              borderTop: i < 2 ? `2px solid ${COLORS.ember}` : "none",
              borderBottom: i >= 2 ? `2px solid ${COLORS.ember}` : "none",
              borderLeft:
                i === 0 || i === 2 ? `2px solid ${COLORS.ember}` : "none",
              borderRight:
                i === 1 || i === 3 ? `2px solid ${COLORS.ember}` : "none",
            } as React.CSSProperties}
          />
        ))}

        {/* Rupee symbol — oversized, burning through */}
        <div
          style={{
            opacity: rupeeOpacity,
            transform: `scale(${rupeeScale})`,
            marginBottom: 40,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 180,
              fontWeight: 600,
              color: COLORS.ember,
              textShadow: `0 0 ${40 * rupeeGlow}px rgba(255, 107, 53, ${0.6 * rupeeGlow}), 0 0 ${80 * rupeeGlow}px rgba(255, 107, 53, ${0.3 * rupeeGlow})`,
              lineHeight: 1,
            }}
          >
            ₹
          </span>
        </div>

        {/* Brand Name — two-word split */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 96,
              fontWeight: 700,
              color: COLORS.ember,
              letterSpacing: "-0.02em",
              transform: `translateX(${kharchaX}px)`,
              opacity: kharchaOp,
            }}
          >
            Kharcha
          </span>
          <span
            style={{
              fontFamily: FONTS.display,
              fontSize: 96,
              fontWeight: 700,
              color: COLORS.ink,
              letterSpacing: "-0.02em",
              transform: `translateX(${kitabX}px)`,
              opacity: kitabOp,
            }}
          >
            Kitab
          </span>
        </div>

        {/* Accent line — ember to saffron gradient */}
        <div
          style={{
            width: lineWidth,
            height: 3,
            background: `linear-gradient(90deg, ${COLORS.ember}, ${COLORS.saffron})`,
            borderRadius: 2,
            marginBottom: 36,
            boxShadow: `0 0 12px rgba(255, 107, 53, 0.3)`,
          }}
        />

        {/* Tagline */}
        <div
          style={{
            opacity: tagOp,
            transform: `translateY(${tagY}px)`,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 30,
              fontWeight: 600,
              color: COLORS.ash,
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
            }}
          >
            Your Hinglish Expense Tracker
          </p>
        </div>

        {/* Three pillars */}
        <div
          style={{
            display: "flex",
            gap: 32,
            marginTop: 48,
            opacity: interpolate(frame, [108, 126], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          {["Privacy-First", "Offline-Ready", "AI-Powered"].map(
            (label, i) => (
              <div
                key={i}
                style={{
                  padding: "14px 28px",
                  borderRadius: 999,
                  border: `1.5px solid ${i === 0 ? COLORS.ember : COLORS.smokeHeavy}`,
                  background:
                    i === 0
                      ? `linear-gradient(135deg, rgba(255,107,53,0.08), rgba(255,107,53,0.02))`
                      : COLORS.mist,
                  transform: `translateY(${spring({ frame: frame - (108 + i * 8), fps, from: 20, to: 0, config: { damping: 18 } })}px)`,
                }}
              >
                <span
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 22,
                    fontWeight: 600,
                    color: i === 0 ? COLORS.ember : COLORS.ink,
                    letterSpacing: "0.06em",
                  }}
                >
                  {label}
                </span>
              </div>
            )
          )}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
