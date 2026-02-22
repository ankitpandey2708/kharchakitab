import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, FONTS } from "../constants";
import { PaperTexture } from "../components/PaperTexture";
import { LedgerLines } from "../components/LedgerLines";
import { GradientOrb } from "../components/GradientOrb";

interface Feature {
  icon: string;
  title: string;
  description: string;
  accent: string;
}

const features: Feature[] = [
  {
    icon: "🎤",
    title: "Voice Powered",
    description: "Speak in Hinglish — we parse it instantly",
    accent: COLORS.ember,
  },
  {
    icon: "📊",
    title: "Smart Analytics",
    description: "Beautiful charts and spending insights",
    accent: COLORS.saffron,
  },
  {
    icon: "🔄",
    title: "Recurring Bills",
    description: "Subscriptions tracked automatically",
    accent: COLORS.sage,
  },
  {
    icon: "🏠",
    title: "Household Sync",
    description: "Share expenses across devices in real-time",
    accent: COLORS.ocean,
  },
];

export const Features: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Header animations
  const headerOp = interpolate(frame, [0, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const headerY = spring({
    frame,
    fps,
    from: -40,
    to: 0,
    config: { damping: 18, stiffness: 80 },
  });
  const lineW = spring({
    frame: frame - 18,
    fps,
    from: 0,
    to: 200,
    config: { damping: 20, stiffness: 50 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      <PaperTexture />
      <LedgerLines showMargin marginX={88} fadeIn={0} lineSpacing={60} />
      <GradientOrb color="ember" size={400} left="10%" top="10%" />
      <GradientOrb color="saffron" size={350} left="90%" top="90%" delay={60} />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          padding: "100px 60px 80px 130px", // offset for margin line
          height: "100%",
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: headerOp,
            transform: `translateY(${headerY}px)`,
            marginBottom: 24,
          }}
        >
          {/* Section label — like a ledger heading */}
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.ash,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              margin: "0 0 16px 0",
            }}
          >
            What You Get
          </p>
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 78,
              fontWeight: 700,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Powerful
            <br />
            <span style={{ color: COLORS.ember }}>Features</span>
          </h2>
          {/* Accent underline */}
          <div
            style={{
              width: lineW,
              height: 3,
              background: `linear-gradient(90deg, ${COLORS.ember}, ${COLORS.saffron})`,
              borderRadius: 2,
              marginTop: 20,
            }}
          />
        </div>

        {/* Feature entries — ledger-style rows */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 0,
            flex: 1,
            justifyContent: "center",
          }}
        >
          {features.map((feature, index) => {
            const entryStart = 38 + index * 24;

            const slideX = spring({
              frame: frame - entryStart,
              fps,
              from: 60,
              to: 0,
              config: { damping: 16, stiffness: 90 },
            });

            const entryOp = interpolate(
              frame,
              [entryStart, entryStart + 12],
              [0, 1],
              { extrapolateRight: "clamp" }
            );

            // Ink-line accent grows on left
            const accentH = spring({
              frame: frame - entryStart - 4,
              fps,
              from: 0,
              to: 1,
              config: { damping: 18, stiffness: 80 },
            });

            return (
              <div
                key={index}
                style={{
                  opacity: entryOp,
                  transform: `translateX(${slideX}px)`,
                  display: "flex",
                  alignItems: "stretch",
                  padding: "32px 0",
                  borderBottom:
                    index < features.length - 1
                      ? `1px solid ${COLORS.rulingRedFaint}`
                      : "none",
                }}
              >
                {/* Left accent — ink line */}
                <div
                  style={{
                    width: 4,
                    borderRadius: 2,
                    background: `linear-gradient(180deg, ${feature.accent}, ${COLORS.saffron})`,
                    marginRight: 28,
                    transformOrigin: "top",
                    transform: `scaleY(${accentH})`,
                    boxShadow: `0 0 12px ${feature.accent}40`,
                  }}
                />

                {/* Icon */}
                <div
                  style={{
                    width: 88,
                    height: 88,
                    borderRadius: 20,
                    background: `linear-gradient(135deg, ${feature.accent}18, ${feature.accent}08)`,
                    border: `1.5px solid ${feature.accent}30`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 48,
                    flexShrink: 0,
                    marginRight: 28,
                  }}
                >
                  {feature.icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <h3
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 44,
                      fontWeight: 700,
                      color: COLORS.ink,
                      margin: "0 0 8px 0",
                      lineHeight: 1.2,
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 28,
                      fontWeight: 400,
                      color: COLORS.ash,
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    {feature.description}
                  </p>
                </div>

                {/* Entry number — ledger style */}
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: 56,
                    fontWeight: 600,
                    color: COLORS.rulingRedFaint,
                    alignSelf: "center",
                    marginLeft: 16,
                    lineHeight: 1,
                  }}
                >
                  {String(index + 1).padStart(2, "0")}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
