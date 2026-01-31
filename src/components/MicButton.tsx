"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic } from "lucide-react";
import React, { useMemo } from "react";

interface MicButtonProps {
  isRecording: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}

export const MicButton = ({
  isRecording,
  startRecording,
  stopRecording,
}: MicButtonProps) => {
  const particles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const angle = (index * Math.PI) / 3;
        return {
          id: index,
          x: Math.sin(angle) * 50,
          y: 40 + Math.random() * 20,
          duration: 1.2 + Math.random() * 0.5,
          delay: index * 0.2,
        };
      }),
    []
  );

  const handleToggle = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-8 left-0 right-0 z-40 flex items-end justify-center">
      <div className="pointer-events-auto">
        <div className="relative">
          {isRecording ? (
            <>
              {/* Outer glow ring */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(255, 107, 53, 0.2) 0%, transparent 70%)",
                }}
                animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0.3, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />

              {/* Expanding ring 1 */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[var(--kk-ember)]"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
              />

              {/* Expanding ring 2 (delayed) */}
              <motion.div
                className="absolute inset-0 rounded-full border border-[var(--kk-saffron)]"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 2.2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
              />

              {/* Expanding ring 3 (more delayed) */}
              <motion.div
                className="absolute inset-0 rounded-full border border-[var(--kk-ember-glow)]/50"
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 2.6, opacity: 0 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.8 }}
              />

              {/* Spark particles */}
              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  className="absolute left-1/2 top-1/2 h-1.5 w-1.5 rounded-full bg-[var(--kk-saffron)]"
                  initial={{ x: "-50%", y: "-50%", scale: 1, opacity: 0.8 }}
                  animate={{
                    x: `calc(-50% + ${particle.x}px)`,
                    y: `calc(-50% - ${particle.y}px)`,
                    scale: 0,
                    opacity: 0,
                  }}
                  transition={{
                    duration: particle.duration,
                    repeat: Infinity,
                    delay: particle.delay,
                    ease: "easeOut",
                  }}
                />
              ))}
            </>
          ) : (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(255, 107, 53, 0.08) 0%, transparent 70%)",
              }}
            />
          )}

          {/* Main button */}
          <motion.button
            type="button"
            aria-pressed={isRecording}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            onClick={handleToggle}
            onContextMenu={(event) => event.preventDefault()}
            className="user-select-none relative flex h-20 w-20 items-center justify-center rounded-full text-white"
            style={{
              background: isRecording
                ? "linear-gradient(135deg, #ff8c5a 0%, #ff6b35 50%, #e04a16 100%)"
                : "linear-gradient(135deg, #ff6b35 0%, #e04a16 100%)",
            }}
            animate={
              isRecording
                ? {
                    scale: [1, 1.05, 1],
                    boxShadow: [
                      "0 8px 32px rgba(255, 107, 53, 0.4), 0 0 0 0 rgba(255, 107, 53, 0.2)",
                      "0 12px 40px rgba(255, 107, 53, 0.5), 0 0 60px 10px rgba(255, 107, 53, 0.15)",
                      "0 8px 32px rgba(255, 107, 53, 0.4), 0 0 0 0 rgba(255, 107, 53, 0.2)",
                    ],
                  }
                : undefined
            }
            transition={
              isRecording
                ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
            whileTap={{ scale: 0.95 }}
          >
            {/* Inner glow */}
            <div
              className="absolute inset-0 rounded-full opacity-50"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%)",
              }}
            />

            {/* Icon with pulse when recording */}
            <motion.div
              animate={{
                scale: isRecording ? [1, 1.15, 1] : 1,
              }}
              transition={
                isRecording
                  ? { duration: 0.8, repeat: Infinity, ease: "easeInOut" }
                  : undefined
              }
            >
              <Mic className="relative z-10 h-8 w-8" strokeWidth={2.5} />
            </motion.div>
          </motion.button>

        </div>
      </div>
    </div>
  );
};
