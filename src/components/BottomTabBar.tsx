"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { BarChart3, Mic, RefreshCw } from "lucide-react";

export type TabType = "summary" | "recurring";

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isRecording: boolean;
  onMicPress: () => void;
}

const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: "summary", label: "Summary", icon: BarChart3 },
  { key: "recurring", label: "Recurring", icon: RefreshCw },
];

const leftTabs = tabs.slice(0, 1);
const rightTabs = tabs.slice(1);

export const BottomTabBar = React.memo(({
  activeTab,
  onTabChange,
  isRecording,
  onMicPress,
}: BottomTabBarProps) => {
  const particles = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => {
        const angle = (index * Math.PI) / 3;
        return {
          id: index,
          x: Math.sin(angle) * 40,
          y: 30 + Math.random() * 15,
          duration: 1.2 + Math.random() * 0.5,
          delay: index * 0.2,
        };
      }),
    []
  );

  const handleMicToggle = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (navigator.vibrate) {
      navigator.vibrate(50);
    }
    onMicPress();
  };

  return (
    <div className="kk-bottom-tab-bar">
      {leftTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`kk-tab-item ${activeTab === tab.key ? "kk-tab-active" : ""}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span className="kk-tab-label">{tab.label}</span>
          </button>
        );
      })}

      <div className="kk-center-fab-container">
        <div className="relative">
          {isRecording && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  background: "radial-gradient(circle, rgba(255, 107, 53, 0.2) 0%, transparent 70%)",
                }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0.3, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />

              <motion.div
                className="absolute inset-0 rounded-full border-2 border-[var(--kk-ember)]"
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.6, opacity: 0 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
              />

              <motion.div
                className="absolute inset-0 rounded-full border border-[var(--kk-saffron)]"
                initial={{ scale: 1, opacity: 0.4 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
              />

              {particles.map((particle) => (
                <motion.div
                  key={particle.id}
                  className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-[var(--kk-saffron)]"
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
          )}

          <motion.button
            type="button"
            aria-pressed={isRecording}
            aria-label={isRecording ? "Stop recording" : "Start recording"}
            onClick={handleMicToggle}
            onContextMenu={(event) => event.preventDefault()}
            className="kk-center-fab user-select-none"
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
                      "0 6px 24px rgba(255, 107, 53, 0.4), 0 0 0 0 rgba(255, 107, 53, 0.2)",
                      "0 10px 32px rgba(255, 107, 53, 0.5), 0 0 40px 8px rgba(255, 107, 53, 0.15)",
                      "0 6px 24px rgba(255, 107, 53, 0.4), 0 0 0 0 rgba(255, 107, 53, 0.2)",
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
            <div
              className="absolute inset-0 rounded-full opacity-50"
              style={{
                background:
                  "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.3) 0%, transparent 50%)",
              }}
            />

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
              <Mic className="relative z-10 h-6 w-6" strokeWidth={2.5} />
            </motion.div>
          </motion.button>
        </div>
      </div>

      {rightTabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`kk-tab-item ${activeTab === tab.key ? "kk-tab-active" : ""}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span className="kk-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});

BottomTabBar.displayName = "BottomTabBar";
