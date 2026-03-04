// PERF-HANDLER: Added 300ms debounce to text input onChange to prevent UI lag during typing

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Mic, RefreshCw, ArrowUp, Keyboard } from "lucide-react";
import { EXAMPLES } from "@/src/components/RecordingStatus";

export type TabType = "summary" | "recurring";

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isRecording: boolean;
  onMicPress: () => void;
  isTextInputMode?: boolean;
  onToggleInputMode?: () => void;
  onTextSubmit: (text: string) => void;
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
  onTextSubmit,
}: BottomTabBarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [displayValue, setDisplayValue] = useState(""); // For optimistic UI
  const [hintIndex, setHintIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // PERF-HANDLER: Debounce timeout ref for text input
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  // PERF-HANDLER: Debounced text input handler (300ms)
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDisplayValue(next); // Show immediately for responsive UI

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      setTextValue(next); // Update actual state after debounce
    }, 300);
  }, []);

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

  useEffect(() => {
    // Randomize starting hint on client to avoid hydration mismatch
    setHintIndex(Math.floor(Math.random() * EXAMPLES.length));
    const interval = setInterval(() => {
      setHintIndex((prev) => (prev + 1) % EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isExpanded) {
      // Delay focus so AnimatePresence has time to mount the input
      const timer = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  const handleMicToggle = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50);
    onMicPress();
  };

  const handleSubmit = useCallback(() => {
    // Use displayValue for submission since it's the most current
    const trimmed = displayValue.trim();
    if (!trimmed) return;
    onTextSubmit(trimmed);
    setTextValue("");
    setDisplayValue("");
    setIsExpanded(false);
  }, [displayValue, onTextSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") setIsExpanded(false);
    },
    [handleSubmit]
  );

  const expand = useCallback(() => setIsExpanded(true), []);

  const hint = EXAMPLES[hintIndex];

  return (
    <>
      {/* ── Text input ledger line ── */}
      <div className="kk-text-bar">
        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              key="open"
              className="kk-text-bar-expanded"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <input
                ref={inputRef}
                type="text"
                value={displayValue}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                onBlur={() => {
                  if (!displayValue.trim()) {
                    setTimeout(() => setIsExpanded(false), 120);
                  }
                }}
                placeholder={hint}
                className="kk-text-bar-input"
                enterKeyHint="send"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <motion.button
                type="button"
                onClick={handleSubmit}
                disabled={!textValue.trim()}
                className="kk-text-bar-send"
                aria-label="Add expense"
                whileTap={{ scale: 0.88 }}
              >
                <ArrowUp className="h-[14px] w-[14px]" strokeWidth={2.5} />
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              role="button"
              tabIndex={0}
              onClick={expand}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") expand();
              }}
              className="kk-text-bar-hint"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <Keyboard className="h-3.5 w-3.5 text-[var(--kk-ash)] shrink-0" strokeWidth={1.5} />
              <span className="kk-text-bar-hint-text">&nbsp;{hint}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom tab bar (unchanged) ── */}
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
                    background:
                      "radial-gradient(circle, rgba(255, 107, 53, 0.2) 0%, transparent 70%)",
                  }}
                  animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0.3, 0.6] }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border-2 border-[var(--kk-ember)]"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "easeOut",
                  }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full border border-[var(--kk-saffron)]"
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 2, opacity: 0 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeOut",
                    delay: 0.4,
                  }}
                />
                {particles.map((p) => (
                  <motion.div
                    key={p.id}
                    className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-[var(--kk-saffron)]"
                    initial={{ x: "-50%", y: "-50%", scale: 1, opacity: 0.8 }}
                    animate={{
                      x: `calc(-50% + ${p.x}px)`,
                      y: `calc(-50% - ${p.y}px)`,
                      scale: 0,
                      opacity: 0,
                    }}
                    transition={{
                      duration: p.duration,
                      repeat: Infinity,
                      delay: p.delay,
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
              onContextMenu={(e) => e.preventDefault()}
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
                      "0 6px 24px rgba(255,107,53,.4), 0 0 0 0 rgba(255,107,53,.2)",
                      "0 10px 32px rgba(255,107,53,.5), 0 0 40px 8px rgba(255,107,53,.15)",
                      "0 6px 24px rgba(255,107,53,.4), 0 0 0 0 rgba(255,107,53,.2)",
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
                    "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%)",
                }}
              />
              <motion.div
                animate={{ scale: isRecording ? [1, 1.15, 1] : 1 }}
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
    </>
  );
});

BottomTabBar.displayName = "BottomTabBar";
