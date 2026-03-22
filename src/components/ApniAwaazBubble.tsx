"use client";

import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { ApniAwaazMessage } from "@/src/utils/apniAwaaz";

interface ApniAwaazBubbleProps {
  message: ApniAwaazMessage;
  isLoading: boolean;
  onDismiss: () => void;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Organic Blob Background — Living, breathing shape
   ═══════════════════════════════════════════════════════════════════════════ */

const OrganicBlob = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {/* Primary blob */}
    <motion.div
      className="absolute -right-20 -top-20 w-64 h-64 rounded-full"
      style={{
        background: "radial-gradient(circle at 30% 30%, rgba(255, 140, 90, 0.12), rgba(255, 107, 53, 0.06))",
        filter: "blur(40px)",
      }}
      animate={{
        scale: [1, 1.1, 1],
        x: [0, 10, 0],
        y: [0, -10, 0],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
    {/* Secondary blob */}
    <motion.div
      className="absolute -left-16 -bottom-16 w-48 h-48 rounded-full"
      style={{
        background: "radial-gradient(circle at 70% 70%, rgba(247, 201, 72, 0.1), rgba(255, 107, 53, 0.04))",
        filter: "blur(32px)",
      }}
      animate={{
        scale: [1, 1.15, 1],
        x: [0, -8, 0],
        y: [0, 8, 0],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: "easeInOut",
        delay: 1,
      }}
    />
    {/* Grain texture overlay */}
    <div
      className="absolute inset-0 opacity-[0.015]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
      }}
    />
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Main Bubble — Organic, sound-wave inspired notification
   ═══════════════════════════════════════════════════════════════════════════ */

export const ApniAwaazBubble = React.memo(({
  message,
  isLoading,
  onDismiss,
}: ApniAwaazBubbleProps) => {
  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white via-[var(--kk-paper)] to-[var(--kk-cream)] p-5 shadow-lg"
      >
        <OrganicBlob />
        <div className="relative space-y-2.5">
          <div className="flex items-center gap-2">
            <motion.div
              className="h-2.5 w-16 rounded-full bg-[var(--kk-smoke-heavy)]"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          <motion.div
            className="h-3.5 w-40 rounded-full bg-[var(--kk-smoke)]"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
          />
        </div>
      </motion.div>
    );
  }

  /* ── Message bubble ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: -16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.98 }}
      transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-gradient-to-br from-white via-[var(--kk-paper)] to-[var(--kk-cream)] shadow-lg"
    >
      <OrganicBlob />

      <div className="relative p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold tracking-[0.16em] uppercase text-[var(--kk-ember)]">
              Mann ki Baat
            </span>
          </div>

          <button
            onClick={onDismiss}
            className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--kk-ash)] hover:text-[var(--kk-ink)] hover:bg-[var(--kk-smoke)] transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Message content */}
        <motion.p
          className="text-[15px] leading-[1.6] font-normal text-[var(--kk-ink)] font-[family:var(--font-display)]"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          <span className="inline-block mr-2 text-lg">{message.emoji}</span>
          <span>{message.message}</span>
        </motion.p>
      </div>

      {/* Bottom gradient fade for scroll indication */}
      <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-[var(--kk-cream)]/50 to-transparent pointer-events-none rounded-b-2xl" />
    </motion.div>
  );
});

ApniAwaazBubble.displayName = "ApniAwaazBubble";
