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
import { PaperTexture } from "../components/PaperTexture";
import { GradientOrb } from "../components/GradientOrb";
import { EmberParticles } from "../components/EmberParticles";

const pillars = [
  { icon: "🔒", label: "Privacy-First", sub: "Data stays on your device" },
  { icon: "📱", label: "Works Offline", sub: "No internet needed" },
  { icon: "🎤", label: "Voice Enabled", sub: "Speak in Hinglish" },
  { icon: "🌐", label: "Open Source", sub: "Free forever" },
];

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background crossfade from paper to dark
  const bgDark = interpolate(frame, [0, 25], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Logo
  const logoScale = spring({
    frame: frame - 15,
    fps,
    config: { damping: 12, stiffness: 80, mass: 0.6 },
  });
  const logoOp = interpolate(frame, [15, 28], [0, 1], {
    extrapolateRight: "clamp",
  });

  // Ember glow pulsing behind logo
  const glowPulse = interpolate(frame % 60, [0, 30, 60], [0.4, 0.7, 0.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Title
  const titleOp = interpolate(frame, [34, 50], [0, 1], {
    extrapolateRight: "clamp",
  });
  const titleY = spring({
    frame: frame - 34,
    fps,
    from: 30,
    to: 0,
    config: { damping: 18 },
  });

  // Divider
  const divW = spring({
    frame: frame - 52,
    fps,
    from: 0,
    to: 300,
    config: { damping: 20, stiffness: 50 },
  });

  // CTA button
  const ctaScale = spring({
    frame: frame - 130,
    fps,
    config: { damping: 14, stiffness: 90, mass: 0.6 },
  });
  const ctaOp = interpolate(frame, [130, 146], [0, 1], {
    extrapolateRight: "clamp",
  });

  // URL
  const urlOp = interpolate(frame, [152, 168], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      {/* Animated background: paper -> dark */}
      <AbsoluteFill style={{ backgroundColor: COLORS.paper }} />
      <AbsoluteFill
        style={{
          backgroundColor: COLORS.ink,
          opacity: bgDark * 0.95,
        }}
      />

      {/* Texture + orbs */}
      <AbsoluteFill
        style={{
          opacity: 0.04,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <GradientOrb color="ember" size={600} left="50%" top="25%" blur={120} />
      <GradientOrb color="saffron" size={450} left="50%" top="80%" delay={80} blur={100} />

      <EmberParticles fadeIn={5} />

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
          gap: 36,
        }}
      >
        {/* Logo with ember glow */}
        <div style={{ position: "relative", opacity: logoOp }}>
          {/* Glow behind */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background: COLORS.ember,
              filter: "blur(60px)",
              transform: "translate(-50%, -50%)",
              opacity: glowPulse,
            }}
          />
          <div
            style={{
              position: "relative",
              width: 140,
              height: 140,
              borderRadius: 32,
              background: `linear-gradient(135deg, ${COLORS.ember}, ${COLORS.emberDeep})`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 20px 60px rgba(255,107,53,0.4)`,
              transform: `scale(${logoScale})`,
            }}
          >
            {/* Rupee symbol */}
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: 80,
                fontWeight: 600,
                color: "white",
                lineHeight: 1,
              }}
            >
              ₹
            </span>
          </div>
        </div>

        {/* Title */}
        <div
          style={{
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            textAlign: "center",
          }}
        >
          <h1
            style={{
              fontFamily: FONTS.display,
              fontSize: 88,
              fontWeight: 700,
              color: COLORS.paper,
              margin: 0,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
            }}
          >
            <span style={{ color: COLORS.ember }}>Kharcha</span>Kitab
          </h1>
        </div>

        {/* Divider */}
        <div
          style={{
            width: divW,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${COLORS.ember}, transparent)`,
            borderRadius: 1,
          }}
        />

        {/* Feature pillars */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 20,
            width: "100%",
            maxWidth: 800,
            marginTop: 12,
          }}
        >
          {pillars.map((p, i) => {
            const pStart = 62 + i * 14;
            const pOp = interpolate(frame, [pStart, pStart + 10], [0, 1], {
              extrapolateRight: "clamp",
            });
            const pX = spring({
              frame: frame - pStart,
              fps,
              from: i % 2 === 0 ? -40 : 40,
              to: 0,
              config: { damping: 18 },
            });

            return (
              <div
                key={i}
                style={{
                  opacity: pOp,
                  transform: `translateX(${pX}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "20px 28px",
                  borderRadius: 16,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: `1px solid rgba(255,255,255,0.08)`,
                  backdropFilter: "blur(12px)",
                }}
              >
                <span style={{ fontSize: 36 }}>{p.icon}</span>
                <div>
                  <p
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 30,
                      fontWeight: 700,
                      color: COLORS.paper,
                      margin: "0 0 4px 0",
                    }}
                  >
                    {p.label}
                  </p>
                  <p
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: 20,
                      fontWeight: 400,
                      color: COLORS.ashLight,
                      margin: 0,
                    }}
                  >
                    {p.sub}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Button */}
        <div
          style={{
            opacity: ctaOp,
            transform: `scale(${ctaScale})`,
            marginTop: 28,
          }}
        >
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.ember}, ${COLORS.emberDeep})`,
              padding: "28px 72px",
              borderRadius: 20,
              boxShadow: `0 16px 60px rgba(255,107,53,0.45), 0 0 30px rgba(255,107,53,0.2)`,
            }}
          >
            <p
              style={{
                fontFamily: FONTS.display,
                fontSize: 44,
                fontWeight: 700,
                color: "white",
                margin: 0,
                textAlign: "center",
              }}
            >
              Start Tracking Today
            </p>
          </div>
        </div>

        {/* URL */}
        <div style={{ opacity: urlOp }}>
          <p
            style={{
              fontFamily: FONTS.mono,
              fontSize: 28,
              fontWeight: 500,
              color: COLORS.ashLight,
              margin: 0,
              letterSpacing: "0.04em",
            }}
          >
            kharchakitab.vercel.app
          </p>
        </div>
      </div>
    </AbsoluteFill>
  );
};
