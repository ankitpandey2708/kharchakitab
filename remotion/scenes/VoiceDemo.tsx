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
import { GradientOrb } from "../components/GradientOrb";
import { EmberParticles } from "../components/EmberParticles";

// Deterministic pseudo-random waveform bar heights
const WAVE_BARS = 28;
const waveHeights = Array.from({ length: WAVE_BARS }).map((_, i) => {
  const v = ((i * 6271 + 32749) % 100) / 100;
  return 0.3 + v * 0.7;
});

export const VoiceDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title
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

  // Mic button
  const micIn = spring({
    frame: frame - 32,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.7 },
  });

  // Pulsing mic glow
  const pulseT = (frame - 40) % 45;
  const pulseScale = interpolate(pulseT, [0, 45], [1, 2.2], {
    extrapolateRight: "clamp",
  });
  const pulseOp = interpolate(pulseT, [0, 45], [0.5, 0], {
    extrapolateRight: "clamp",
  });
  const pulse2T = ((frame - 40) + 15) % 45;
  const pulse2Scale = interpolate(pulse2T, [0, 45], [1, 1.8], {
    extrapolateRight: "clamp",
  });
  const pulse2Op = interpolate(pulse2T, [0, 45], [0.3, 0], {
    extrapolateRight: "clamp",
  });

  const micActive = frame > 40;

  // Waveform
  const waveOp = interpolate(frame, [44, 58], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Speech bubble with typing effect
  const speechText = "Aaj 500 rupay chai pe kharcha kiya";
  const typingProgress = interpolate(frame, [65, 110], [0, 1], {
    extrapolateRight: "clamp",
  });
  const visibleChars = Math.floor(typingProgress * speechText.length);
  const speechOp = interpolate(frame, [62, 70], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Arrow / processing indicator
  const arrowOp = interpolate(frame, [118, 128], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Result card
  const cardScale = spring({
    frame: frame - 136,
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.6 },
  });
  const cardOp = interpolate(frame, [136, 148], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      {/* Dark paper texture */}
      <AbsoluteFill
        style={{
          opacity: 0.06,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <GradientOrb color="ember" size={600} left="50%" top="30%" blur={120} />
      <GradientOrb
        color="saffron"
        size={400}
        left="50%"
        top="65%"
        delay={60}
        blur={100}
      />

      <EmberParticles fadeIn={15} />

      {/* Content */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "80px 60px",
          gap: 48,
        }}
      >
        {/* Title */}
        <div
          style={{
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 20,
              fontWeight: 700,
              color: COLORS.ashLight,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              margin: "0 0 16px 0",
            }}
          >
            Voice Logging
          </p>
          <h2
            style={{
              fontFamily: FONTS.display,
              fontSize: 72,
              fontWeight: 700,
              color: COLORS.paper,
              margin: 0,
              lineHeight: 1.15,
            }}
          >
            Just{" "}
            <span
              style={{
                color: COLORS.ember,
                textShadow: "0 0 30px rgba(255,107,53,0.3)",
              }}
            >
              Speak
            </span>
          </h2>
        </div>

        {/* Mic area */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 260,
            height: 260,
          }}
        >
          {/* Pulse rings */}
          {micActive && (
            <>
              <div
                style={{
                  position: "absolute",
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  border: `2px solid ${COLORS.ember}`,
                  transform: `scale(${pulseScale})`,
                  opacity: pulseOp,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  width: 180,
                  height: 180,
                  borderRadius: "50%",
                  border: `1.5px solid ${COLORS.saffron}`,
                  transform: `scale(${pulse2Scale})`,
                  opacity: pulse2Op,
                }}
              />
            </>
          )}

          {/* Mic button */}
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: `linear-gradient(135deg, ${COLORS.ember} 0%, ${COLORS.emberDeep} 100%)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 60px rgba(255, 107, 53, ${micActive ? 0.5 : 0.3}), 0 20px 60px rgba(255, 107, 53, 0.3)`,
              transform: `scale(${micIn})`,
            }}
          >
            {/* SVG Mic icon */}
            <svg
              width="80"
              height="80"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <line x1="12" y1="17" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </div>
        </div>

        {/* Waveform visualization */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            height: 80,
            opacity: waveOp,
          }}
        >
          {waveHeights.map((h, i) => {
            const barPhase = (frame * 0.15 + i * 0.5) % (Math.PI * 2);
            const barH = micActive
              ? 12 + h * 60 * (0.5 + 0.5 * Math.sin(barPhase))
              : 12;

            return (
              <div
                key={i}
                style={{
                  width: 6,
                  height: barH,
                  borderRadius: 3,
                  background: `linear-gradient(180deg, ${COLORS.ember}, ${COLORS.saffron})`,
                  opacity: 0.7 + h * 0.3,
                }}
              />
            );
          })}
        </div>

        {/* Speech bubble */}
        <div
          style={{
            opacity: speechOp,
            backgroundColor: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(20px)",
            border: `1px solid rgba(255,255,255,0.12)`,
            padding: "28px 44px",
            borderRadius: 24,
            borderBottomLeftRadius: 8,
            maxWidth: 820,
            position: "relative",
          }}
        >
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: 38,
              fontWeight: 500,
              color: COLORS.paper,
              margin: 0,
              fontStyle: "italic",
              lineHeight: 1.5,
            }}
          >
            "{speechText.slice(0, visibleChars)}
            {visibleChars < speechText.length && (
              <span
                style={{
                  opacity: frame % 15 < 8 ? 1 : 0,
                  color: COLORS.ember,
                }}
              >
                |
              </span>
            )}
            {visibleChars >= speechText.length && '"'}
          </p>
        </div>

        {/* Processing arrow */}
        <div
          style={{
            opacity: arrowOp,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke={COLORS.ember}
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <polyline points="19 12 12 19 5 12" />
          </svg>
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 18,
              fontWeight: 600,
              color: COLORS.ashLight,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
            }}
          >
            AI Parsed
          </span>
        </div>

        {/* Result card */}
        <div
          style={{
            opacity: cardOp,
            transform: `scale(${cardScale})`,
            width: "85%",
            maxWidth: 860,
            backgroundColor: COLORS.paper,
            padding: "36px 40px",
            borderRadius: 24,
            boxShadow: `0 24px 80px rgba(0,0,0,0.4), 0 0 40px rgba(255,107,53,0.15)`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* Category icon */}
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: 16,
                  background: `linear-gradient(135deg, ${COLORS.ember}, ${COLORS.emberDeep})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 20px rgba(255,107,53,0.25)",
                }}
              >
                <span style={{ fontSize: 38 }}>☕</span>
              </div>
              <div>
                <p
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 34,
                    fontWeight: 600,
                    color: COLORS.ink,
                    margin: "0 0 4px 0",
                  }}
                >
                  Tea
                </p>
                <p
                  style={{
                    fontFamily: FONTS.body,
                    fontSize: 20,
                    fontWeight: 500,
                    color: COLORS.ash,
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Food & Dining
                </p>
              </div>
            </div>

            {/* Amount */}
            <div style={{ textAlign: "right" }}>
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 52,
                  fontWeight: 700,
                  color: COLORS.ember,
                  lineHeight: 1,
                }}
              >
                <span style={{ fontSize: 36, fontWeight: 500 }}>₹</span>
                500
              </span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
