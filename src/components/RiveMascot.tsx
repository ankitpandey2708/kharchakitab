"use client";

import React, { useEffect, useState } from "react";
import { useRive, useStateMachineInput } from "@rive-app/react-canvas";
import { motion, AnimatePresence } from "framer-motion";
import type { MascotMood } from "@/src/context/MascotContext";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface RiveMascotProps {
  mood: MascotMood;
  size?: number;
  className?: string;
}

// ---------------------------------------------------------------------------
// SVG Fallback — Animated Coin Character (v2)
// Designed with "Ink & Ember" maximalist aesthetic:
// warm, rich, handcrafted — like a traditional Indian gold coin come alive
// ---------------------------------------------------------------------------

interface FallbackProps {
  mood: MascotMood;
  size: number;
  className?: string;
}

/* ------------------------------------------------------------------ */
/*  Mood config — drives the entire visual & motion system below      */
/* ------------------------------------------------------------------ */

interface MoodVisuals {
  brows: { left: number; right: number };          // rotation in degrees
  iris: { x: number; y: number };                   // iris offset
  mouthPath: string;
  mouthColor: string;
  blinkMs: number;                                   // time between blinks
  floatAmp: number;                                  // float amplitude
  squashStretch: number;                             // squash amount
  tilt: number;                                      // coin tilt degrees
  glowColor: string;
  glowSize: number;
  hasParticles: boolean;
  particleType: "sparkle" | "dots" | "stars" | "none";
}

const MOOD: Record<MascotMood, MoodVisuals> = {
  idle: {
    brows: { left: 0, right: 0 },
    iris: { x: 0, y: 0 },
    mouthPath: "M14 18 Q18 22 22 18",
    mouthColor: "stroke-[var(--kk-ember-deep)]",
    blinkMs: 3200,
    floatAmp: 4,
    squashStretch: 0.03,
    tilt: 0,
    glowColor: "rgba(232,101,40,0.10)",
    glowSize: 1,
    hasParticles: false,
    particleType: "none",
  },
  celebrate: {
    brows: { left: -8, right: -8 },
    iris: { x: 0, y: -1 },
    mouthPath: "M12 18 Q18 25 24 18",
    mouthColor: "stroke-[var(--kk-sage)]",
    blinkMs: 3800,
    floatAmp: 7,
    squashStretch: 0.07,
    tilt: 0,
    glowColor: "rgba(45,141,96,0.25)",
    glowSize: 1.2,
    hasParticles: true,
    particleType: "stars",
  },
  wave: {
    brows: { left: 0, right: 0 },
    iris: { x: 0, y: 0 },
    mouthPath: "M14 19 Q18 23 22 19",
    mouthColor: "stroke-[var(--kk-ember-deep)]",
    blinkMs: 2800,
    floatAmp: 5,
    squashStretch: 0.04,
    tilt: 6,
    glowColor: "rgba(232,101,40,0.13)",
    glowSize: 1,
    hasParticles: false,
    particleType: "none",
  },
  roast: {
    brows: { left: -10, right: 6 },
    iris: { x: 2, y: 0 },
    mouthPath: "M15 19 Q18 17 21 19",
    mouthColor: "stroke-[var(--kk-ember)]",
    blinkMs: 3000,
    floatAmp: 3,
    squashStretch: 0.02,
    tilt: 4,
    glowColor: "rgba(247,201,72,0.16)",
    glowSize: 0.9,
    hasParticles: false,
    particleType: "none",
  },
  warning: {
    brows: { left: 10, right: 10 },
    iris: { x: 0, y: 0 },
    mouthPath: "M14 19 Q18 16 22 19",
    mouthColor: "stroke-[var(--kk-ember)]",
    blinkMs: 1800,
    floatAmp: 2,
    squashStretch: 0.05,
    tilt: 0,
    glowColor: "rgba(232,101,40,0.30)",
    glowSize: 1.3,
    hasParticles: false,
    particleType: "none",
  },
  thinking: {
    brows: { left: -4, right: -4 },
    iris: { x: 0, y: -3 },
    mouthPath: "M16 18 Q18 20 20 18",
    mouthColor: "stroke-[var(--kk-saffron)]",
    blinkMs: 4500,
    floatAmp: 3,
    squashStretch: 0.03,
    tilt: 2,
    glowColor: "rgba(247,201,72,0.13)",
    glowSize: 0.95,
    hasParticles: true,
    particleType: "dots",
  },
};

/* ------------------------------------------------------------------ */
/*  Shapes                                                             */
/* ------------------------------------------------------------------ */

/** A tiny 5-point star for sparkle effects */
function Star({ cx, cy, r, color, delay }: { cx: number; cy: number; r: number; color: string; delay: number }) {
  const points = (() => {
    const pts: string[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i * 144 - 90) * (Math.PI / 180);
      pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
      const a2 = ((i * 144 + 72) - 90) * (Math.PI / 180);
      pts.push(`${cx + r * 0.4 * Math.cos(a2)},${cy + r * 0.4 * Math.sin(a2)}`);
    }
    return pts.join(" ");
  })();

  return (
    <motion.polygon
      points={points}
      fill={color}
      initial={{ scale: 0, opacity: 0, rotate: 0 }}
      animate={{ scale: [0, 1.3, 0], opacity: [0, 1, 0], rotate: [0, 180, 360] }}
      transition={{ duration: 1.4 + delay * 0.3, repeat: Infinity, delay, ease: "easeOut" }}
      style={{ originX: `${cx}px`, originY: `${cy}px` }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Grain overlay (SVG feTurbulence noise)                             */
/* ------------------------------------------------------------------ */

function GrainOverlay({ id }: { id: string }) {
  return (
    <filter id={id}>
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feBlend in="SourceGraphic" mode="multiply" />
    </filter>
  );
}

/* ------------------------------------------------------------------ */
/*  Eyelid — covers eyes during blink, top to bottom                  */
/* ------------------------------------------------------------------ */

function Eyelid({ blink }: { blink: boolean }) {
  return (
    <motion.rect
      x={0} y={0} width={36} height={36}
      fill="url(#coinGrad)"
      clipPath="url(#eyeClip)"
      initial={false}
      animate={blink ? { y: [0, 12, 0] } : { y: 0 }}
      transition={{ duration: 0.1, ease: "easeInOut" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Orbiting ring (idle)                                              */
/* ------------------------------------------------------------------ */

function OrbitingRing() {
  return (
    <motion.circle
      cx="18" cy="18" r="20"
      fill="none"
      stroke="rgba(232,101,40,0.08)"
      strokeWidth="1.5"
      strokeDasharray="4 6"
      initial={{ rotate: 0, scale: 0.8, opacity: 0 }}
      animate={{ rotate: 360, scale: 1, opacity: 1 }}
      transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      style={{ originX: "18px", originY: "18px" }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main fallback component                                           */
/* ------------------------------------------------------------------ */

const MascotFallback = React.memo(({ mood, size, className = "" }: FallbackProps) => {
  const v = MOOD[mood];
  const [blink, setBlink] = useState(false);
  const cx = 18;
  const es = 3.6; // eye spacing from center
  const eyeY = 14.2;

  // ── Blink timer ──
  useEffect(() => {
    const blinkTimeout: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const doBlink = () => {
      setBlink(true);
      blinkTimeout.current = setTimeout(() => setBlink(false), 100);
    };
    const interval = setInterval(doBlink, v.blinkMs);
    return () => {
      clearInterval(interval);
      if (blinkTimeout.current) clearTimeout(blinkTimeout.current);
    };
  }, [v.blinkMs]);

  return (
    <div className={`relative inline-flex items-center justify-center select-none ${className}`} style={{ width: size, height: size }}>
      {/* ── Depth layers ── */}
      <svg width={size} height={size} viewBox="0 0 36 36" className="absolute inset-0">
        <defs>
          <GrainOverlay id="coinGrain" />
          <linearGradient id="coinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff9a5e" />
            <stop offset="35%" stopColor="#ff7a3e" />
            <stop offset="65%" stopColor="#e85a28" />
            <stop offset="100%" stopColor="#c43d15" />
          </linearGradient>
          <linearGradient id="coinShine" x1="0%" y1="0%" x2="100%" y2="120%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.50)" />
            <stop offset="35%" stopColor="rgba(255,255,255,0.06)" />
            <stop offset="70%" stopColor="rgba(0,0,0,0.04)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.15)" />
          </linearGradient>
          <linearGradient id="rimGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,215,140,0.6)" />
            <stop offset="50%" stopColor="rgba(196,61,21,0.3)" />
            <stop offset="100%" stopColor="rgba(255,215,140,0.4)" />
          </linearGradient>
          <radialGradient id="glowGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={v.glowColor} />
            <stop offset="100%" stopColor="transparent" />
          </radialGradient>
          <filter id="coinShadow">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="rgba(0,0,0,0.2)" />
          </filter>
          <clipPath id="eyeClip">
            <rect x="12" y="11" width="12" height="6" rx="1" />
          </clipPath>
        </defs>

        {/* Glow */}
        <circle cx="18" cy="18" r="14" fill="url(#glowGrad)" opacity={0.8} />

        {/* Orbiting ring — idle only */}
        {mood === "idle" && <OrbitingRing />}          {/* Coin group (animated as one unit for squash & tilt) */}
        <motion.g
          filter="url(#coinShadow)"
          animate={{
            y: [0, -v.floatAmp, 0],
            scaleX: [1, 1 - v.squashStretch, 1],
            scaleY: [1, 1 + v.squashStretch * 0.7, 1],
          }}
          transition={{ duration: 3.2, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
          style={{ originX: "18px", originY: "18px" }}
        >
          <motion.g
            animate={{
              rotate: mood === "wave" ? [v.tilt, -v.tilt] : v.tilt,
            }}
            transition={
              mood === "wave"
                ? { duration: 2, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }
                : { type: "spring", stiffness: 200, damping: 18 }
            }
            style={{ originX: "18px", originY: "18px" }}
          >
            {/* Coin body */}
            <circle cx="18" cy="18" r="16" fill="url(#coinGrad)" />
            <circle cx="18" cy="18" r="16" fill="url(#coinShine)" />

            {/* Rim ring */}
            <circle cx="18" cy="18" r="14.5" fill="none" stroke="url(#rimGrad)" strokeWidth="1.2" />
            <circle cx="18" cy="18" r="13.8" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

            {/* Decorative dots around rim */}
            {[...Array(12)].map((_, i) => {
              const angle = (i * 30 - 90) * (Math.PI / 180);
              const dx = 18 + 14.2 * Math.cos(angle);
              const dy = 18 + 14.2 * Math.sin(angle);
              return <circle key={i} cx={dx} cy={dy} r="0.4" fill="rgba(255,255,255,0.15)" />;
            })}

            {/* Grain texture overlay */}
            <circle cx="18" cy="18" r="16" fill="rgba(255,255,255,0.04)" filter="url(#coinGrain)" opacity={0.3} />

            {/* ₹ symbol */}
            <text
              x="18" y="13.2"
              textAnchor="middle"
              dominantBaseline="central"
              fill="rgba(255,255,255,0.15)"
              fontFamily="'Noto Serif Devanagari', 'Noto Serif', Georgia, serif"
              fontSize="10"
              fontWeight="700"
              letterSpacing="0.5"
            >
              ₹
            </text>

            {/* ── Eyebrows ── */}
            <motion.g
              initial={false}
              animate={{ rotate: v.brows.left }}
              style={{ originX: `${cx - es}px`, originY: `${eyeY - 4}px` }}
            >
              <line x1={cx - es - 2} y1={eyeY - 4.5} x2={cx - es + 2} y2={eyeY - 4.5}
                stroke="var(--kk-ink)" strokeWidth="0.9" strokeLinecap="round" strokeOpacity={0.5} />
            </motion.g>
            <motion.g
              initial={false}
              animate={{ rotate: v.brows.right }}
              style={{ originX: `${cx + es}px`, originY: `${eyeY - 4}px` }}
            >
              <line x1={cx + es - 2} y1={eyeY - 4.5} x2={cx + es + 2} y2={eyeY - 4.5}
                stroke="var(--kk-ink)" strokeWidth="0.9" strokeLinecap="round" strokeOpacity={0.5} />
            </motion.g>

            {/* ── Eyes ── */}
            <g clipPath="url(#eyeClip)">
              {/* Left eye */}
              <ellipse cx={cx - es} cy={eyeY} rx="2.6" ry="2.8" fill="rgba(255,255,255,0.92)" />
              <ellipse cx={cx - es + v.iris.x * 0.4} cy={eyeY + v.iris.y * 0.3}
                rx="1.3" ry="1.6" fill="#3a2a1a" />
              <circle cx={cx - es + v.iris.x * 0.4 + 0.6} cy={eyeY + v.iris.y * 0.3 - 0.6}
                r="0.45" fill="white" opacity={0.7} />

              {/* Right eye */}
              <ellipse cx={cx + es} cy={eyeY} rx="2.6" ry="2.8" fill="rgba(255,255,255,0.92)" />
              <ellipse cx={cx + es + v.iris.x * 0.4} cy={eyeY + v.iris.y * 0.3}
                rx="1.3" ry="1.6" fill="#3a2a1a" />
              <circle cx={cx + es + v.iris.x * 0.4 + 0.6} cy={eyeY + v.iris.y * 0.3 - 0.6}
                r="0.45" fill="white" opacity={0.7} />

              {/* Eyelid blink */}
              <Eyelid blink={blink} />
            </g>

            {/* ── Mouth ── */}
            <motion.path
              d={v.mouthPath}
              fill="none"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={v.mouthColor}
              initial={false}
              animate={{ d: v.mouthPath }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />
          </motion.g>
        </motion.g>

        {/* ── Particles ── */}
        <AnimatePresence>
          {v.hasParticles && (
            <motion.g
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {v.particleType === "stars" && (
                <>
                  <Star cx={8} cy={7} r={1.8} color="var(--kk-saffron)" delay={0} />
                  <Star cx={27} cy={5} r={1.4} color="var(--kk-ember-glow)" delay={0.25} />
                  <Star cx={29} cy={16} r={1.6} color="var(--kk-saffron)" delay={0.5} />
                  <Star cx={7} cy={22} r={1.2} color="var(--kk-ember-glow)" delay={0.35} />
                  <Star cx={22} cy={26} r={1} color="var(--kk-saffron)" delay={0.15} />
                </>
              )}
              {v.particleType === "dots" && (
                <>
                  {[[10, 8], [26, 7], [28, 20], [9, 24], [24, 28]].map(([x, y], i) => (
                    <motion.circle
                      key={i}
                      cx={x} cy={y} r={0.9}
                      fill="var(--kk-saffron)"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: [0, 1.2, 0],
                        opacity: [0, 0.8, 0],
                        y: [y, y - 4, y - 8],
                      }}
                      transition={{ duration: 1.8 + i * 0.2, repeat: Infinity, delay: i * 0.3, ease: "easeOut" }}
                    />
                  ))}
                </>
              )}
            </motion.g>
          )}
        </AnimatePresence>

        {/* Ground shadow */}
        <motion.ellipse
          cx="18" cy="33"
          rx="10" ry="2"
          fill="rgba(0,0,0,0.08)"
          filter="blur(3px)"
          animate={{
            scaleX: [1, 0.85, 1],
            opacity: [0.4, 0.6, 0.4],
          }}
          transition={{ duration: 3.2, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
        />
      </svg>
    </div>
  );
});

MascotFallback.displayName = "MascotFallback";

// ---------------------------------------------------------------------------
// Rive Mascot — attempts to load .riv, falls back to SVG
// ---------------------------------------------------------------------------

export const RiveMascot = React.memo(({ mood, size = 120, className = "" }: RiveMascotProps) => {
  const [useFallback, setUseFallback] = useState(true);

  const { RiveComponent, rive } = useRive(
    {
      src: "/rive/mascot.riv",
      artboard: "Mascot",
      stateMachines: "StateMachine",
      autoplay: true,
      onLoad: () => {
        setUseFallback(false);
      },
      onLoadError: () => {
        setUseFallback(true);
      },
    },
    {
      shouldResizeCanvasToContainer: true,
      fitCanvasToArtboardHeight: true,
    }
  );

  const idleInput = useStateMachineInput(rive, "StateMachine", "Idle");
  const celebrateInput = useStateMachineInput(rive, "StateMachine", "Celebrate");
  const waveInput = useStateMachineInput(rive, "StateMachine", "Wave");
  const roastInput = useStateMachineInput(rive, "StateMachine", "Roast");
  const warningInput = useStateMachineInput(rive, "StateMachine", "Warning");
  const thinkingInput = useStateMachineInput(rive, "StateMachine", "Thinking");

  useEffect(() => {
    if (!rive || useFallback) return;
    const inputMap: Record<MascotMood, unknown> = {
      idle: idleInput,
      celebrate: celebrateInput,
      wave: waveInput,
      roast: roastInput,
      warning: warningInput,
      thinking: thinkingInput,
    };
    const targetInput = inputMap[mood] as { fire?: () => void } | null;
    if (targetInput && typeof targetInput.fire === "function") {
      targetInput.fire();
    }
  }, [mood, rive, useFallback, idleInput, celebrateInput, waveInput, roastInput, warningInput, thinkingInput]);

  if (useFallback) {
    return <MascotFallback mood={mood} size={size} className={className} />;
  }

  return (
    <div
      className={`relative overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      <RiveComponent />
    </div>
  );
});

RiveMascot.displayName = "RiveMascot";
