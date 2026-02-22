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

const categories = [
  { name: "Food & Dining", amount: 8500, color: COLORS.ember, pct: 35 },
  { name: "Shopping", amount: 6800, color: COLORS.saffron, pct: 28 },
  { name: "Bills & Utilities", amount: 4900, color: COLORS.sage, pct: 20 },
  { name: "Transport", amount: 4200, color: COLORS.ocean, pct: 17 },
];

// SVG donut chart helper
const DONUT_RADIUS = 140;
const DONUT_STROKE = 36;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export const Analytics: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 28], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = spring({
    frame,
    fps,
    from: -30,
    to: 0,
    config: { damping: 18 },
  });

  // Donut chart animation
  const donutProgress = spring({
    frame: frame - 30,
    fps,
    from: 0,
    to: 1,
    config: { damping: 25, stiffness: 40 },
  });

  // Total amount counter
  const totalAmount = Math.round(
    interpolate(frame, [38, 80], [0, 24400], { extrapolateRight: "clamp" })
  );

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper }}>
      <PaperTexture />
      <LedgerLines showMargin={false} lineSpacing={64} fadeIn={0} />
      <GradientOrb color="ember" size={350} left="15%" top="15%" />
      <GradientOrb color="saffron" size={300} left="85%" top="85%" delay={60} />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          flexDirection: "column",
          padding: "90px 70px",
          height: "100%",
          gap: 50,
        }}
      >
        {/* Header */}
        <div
          style={{
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
          }}
        >
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
            Insights
          </p>
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 72,
              fontWeight: 700,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Track Every
            <br />
            <span style={{ color: COLORS.ember }}>Rupee</span>
          </h2>
        </div>

        {/* Donut chart with center amount */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            position: "relative",
            opacity: interpolate(frame, [26, 40], [0, 1], {
              extrapolateRight: "clamp",
            }),
          }}
        >
          <svg
            width={DONUT_RADIUS * 2 + DONUT_STROKE + 20}
            height={DONUT_RADIUS * 2 + DONUT_STROKE + 20}
            viewBox={`0 0 ${DONUT_RADIUS * 2 + DONUT_STROKE + 20} ${DONUT_RADIUS * 2 + DONUT_STROKE + 20}`}
          >
            {/* Background ring */}
            <circle
              cx={DONUT_RADIUS + DONUT_STROKE / 2 + 10}
              cy={DONUT_RADIUS + DONUT_STROKE / 2 + 10}
              r={DONUT_RADIUS}
              fill="none"
              stroke={COLORS.smoke}
              strokeWidth={DONUT_STROKE}
            />

            {/* Category segments */}
            {(() => {
              let offset = 0;
              return categories.map((cat, i) => {
                const segmentLength =
                  (cat.pct / 100) * DONUT_CIRCUMFERENCE * donutProgress;
                const dashOffset = -offset * donutProgress;
                offset += (cat.pct / 100) * DONUT_CIRCUMFERENCE;

                return (
                  <circle
                    key={i}
                    cx={DONUT_RADIUS + DONUT_STROKE / 2 + 10}
                    cy={DONUT_RADIUS + DONUT_STROKE / 2 + 10}
                    r={DONUT_RADIUS}
                    fill="none"
                    stroke={cat.color}
                    strokeWidth={DONUT_STROKE}
                    strokeDasharray={`${segmentLength} ${DONUT_CIRCUMFERENCE}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${DONUT_RADIUS + DONUT_STROKE / 2 + 10} ${DONUT_RADIUS + DONUT_STROKE / 2 + 10})`}
                    style={{
                      filter: `drop-shadow(0 0 6px ${cat.color}40)`,
                    }}
                  />
                );
              });
            })()}
          </svg>

          {/* Center text */}
          <div
            style={{
              position: "absolute",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 20,
                fontWeight: 600,
                color: COLORS.ash,
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                margin: "0 0 8px 0",
              }}
            >
              This Month
            </p>
            <p
              style={{
                fontFamily: FONTS.mono,
                fontSize: 64,
                fontWeight: 700,
                color: COLORS.ember,
                margin: 0,
                lineHeight: 1,
              }}
            >
              <span style={{ fontSize: 40, fontWeight: 500 }}>₹</span>
              {totalAmount.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {/* Category breakdown list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {categories.map((cat, i) => {
            const entryStart = 65 + i * 18;

            const barPct = spring({
              frame: frame - entryStart,
              fps,
              from: 0,
              to: cat.pct,
              config: { damping: 22, stiffness: 70 },
            });

            const entryOp = interpolate(
              frame,
              [entryStart, entryStart + 10],
              [0, 1],
              { extrapolateRight: "clamp" }
            );

            const entryX = spring({
              frame: frame - entryStart,
              fps,
              from: 40,
              to: 0,
              config: { damping: 18 },
            });

            return (
              <div
                key={i}
                style={{
                  opacity: entryOp,
                  transform: `translateX(${entryX}px)`,
                  backgroundColor: COLORS.mistSolid,
                  padding: "28px 32px",
                  borderRadius: 20,
                  border: `1px solid ${COLORS.smokeHeavy}`,
                }}
              >
                {/* Row: color dot, name, amount */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    {/* Color indicator */}
                    <div
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 4,
                        backgroundColor: cat.color,
                        boxShadow: `0 0 8px ${cat.color}40`,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: FONTS.body,
                        fontSize: 32,
                        fontWeight: 600,
                        color: COLORS.ink,
                      }}
                    >
                      {cat.name}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 36,
                      fontWeight: 700,
                      color: cat.color,
                    }}
                  >
                    ₹{cat.amount.toLocaleString("en-IN")}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  style={{
                    height: 10,
                    backgroundColor: COLORS.smoke,
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${barPct}%`,
                      background: `linear-gradient(90deg, ${cat.color}, ${cat.color}cc)`,
                      borderRadius: 999,
                      boxShadow: `0 0 10px ${cat.color}30`,
                    }}
                  />
                </div>

                {/* Percentage label */}
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <span
                    style={{
                      fontFamily: FONTS.mono,
                      fontSize: 20,
                      fontWeight: 600,
                      color: COLORS.ashLight,
                    }}
                  >
                    {cat.pct}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
