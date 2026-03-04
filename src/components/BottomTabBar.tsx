// PERF-HANDLER: Added 300ms debounce to text input onChange to prevent UI lag during typing

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart3, Mic, RefreshCw, ArrowUp, Square, Check, Loader2, Keyboard } from "lucide-react";
import { EXAMPLES } from "@/src/components/RecordingStatus";

export type TabType = "summary" | "recurring";

export interface TranscriptFeedback {
  txId: string;
  item: string;
  amount: number;
  category: string;
  paymentMethod: string;
  currencySymbol: string;
}

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  isRecording: boolean;
  isProcessing?: boolean;
  onMicPress: () => void;
  onTextSubmit: (text: string) => void;
  transcriptFeedback?: TranscriptFeedback | null;
  onUndoTranscript?: () => void;
}

const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: "summary", label: "Summary", icon: BarChart3 },
  { key: "recurring", label: "Recurring", icon: RefreshCw },
];

export const BottomTabBar = React.memo(({
  activeTab,
  onTabChange,
  isRecording,
  isProcessing,
  onMicPress,
  onTextSubmit,
  transcriptFeedback,
  onUndoTranscript,
}: BottomTabBarProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [displayValue, setDisplayValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [hintIndex, setHintIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // PERF-HANDLER: Debounce timeout ref for text input
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, []);

  // PERF-HANDLER: Debounced text input handler (300ms)
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setDisplayValue(next);
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      setTextValue(next);
    }, 300);
  }, []);

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
      const timer = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  // Collapse typing mode when recording/processing starts or feedback appears
  useEffect(() => {
    if (isRecording || isProcessing || transcriptFeedback) {
      setIsExpanded(false);
      setDisplayValue("");
      setTextValue("");
    }
  }, [isRecording, isProcessing, transcriptFeedback]);

  const handleMicToggle = (event: React.SyntheticEvent) => {
    event.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50);
    onMicPress();
  };

  const handleSubmit = useCallback(() => {
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

  // Pill state machine — priority order
  const pillState: "recording" | "processing" | "feedback" | "typing" | "idle" =
    isRecording ? "recording" :
      isProcessing ? "processing" :
        transcriptFeedback ? "feedback" :
          isExpanded ? "typing" :
            "idle";

  return (
    <>
      {/* ── Unified Input Pill ── */}
      <div className="kk-text-bar" aria-live="polite" aria-atomic="true">
        <AnimatePresence mode="wait" initial={false}>
          {pillState === "recording" && (
            <motion.div
              key="recording"
              className="kk-text-bar-recording flex items-center gap-3 rounded-2xl border border-[var(--kk-ember)] bg-white/95 backdrop-blur-sm shadow-md px-4 h-12 w-full"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
            >
              <button
                type="button"
                onClick={handleMicToggle}
                aria-label="Stop recording"
                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-[var(--kk-ember)] text-white animate-ember-pulse"
              >
                <Square className="h-3 w-3 fill-current" strokeWidth={0} />
              </button>
              {/* Animated waveform bars */}
              <div className="flex items-center gap-[3px] flex-1 justify-center" aria-hidden="true">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span
                    key={i}
                    className="kk-wave-bar"
                    style={{ animationDelay: `${i * 0.1}s` }}
                  />
                ))}
              </div>
              <span className="text-xs font-medium text-[var(--kk-ember)] flex-shrink-0">listening…</span>
            </motion.div>
          )}

          {pillState === "processing" && (
            <motion.div
              key="processing"
              className="kk-text-bar-processing flex items-center gap-3 rounded-2xl border border-[var(--kk-ember)]/30 bg-white/95 backdrop-blur-sm shadow-md px-4 h-12 w-full"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              role="status"
            >
              <Loader2 className="h-4 w-4 text-[var(--kk-ember)] animate-spin flex-shrink-0" />
              <span className="text-sm font-medium text-[var(--kk-ash)]">processing…</span>
            </motion.div>
          )}

          {pillState === "feedback" && transcriptFeedback && (
            <motion.div
              key="feedback"
              className="kk-text-bar-feedback relative flex items-center gap-2 rounded-2xl border border-[var(--kk-sage)] bg-white/95 backdrop-blur-sm shadow-md px-3 h-12 w-full overflow-hidden"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.18 }}
              role="status"
            >
              <div className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-[var(--kk-sage-bg)]">
                <Check className="h-3.5 w-3.5 text-[var(--kk-sage)]" strokeWidth={2.5} />
              </div>
              <span className="flex-1 min-w-0 text-sm font-medium text-[var(--kk-ink)] truncate">
                {transcriptFeedback.item}
                <span className="text-[var(--kk-ash)]"> · </span>
                <span className="text-xs text-[var(--kk-ash)]">{transcriptFeedback.category}</span>
                <span className="text-[var(--kk-ash)]"> · </span>
                <span className="text-[var(--kk-ember)] font-semibold">
                  {transcriptFeedback.currencySymbol}{transcriptFeedback.amount}
                </span>
              </span>
              <button
                type="button"
                onClick={onUndoTranscript}
                className="kk-btn-ghost kk-btn-compact flex-shrink-0"
                aria-label={`Undo adding ${transcriptFeedback.item} ${transcriptFeedback.currencySymbol}${transcriptFeedback.amount}`}
              >
                Undo
              </button>
              {/* Countdown bar — depletes over 4s */}
              <div className="kk-undo-countdown" aria-hidden="true" />
            </motion.div>
          )}

          {pillState === "typing" && (
            <motion.div
              key="typing"
              className="kk-text-bar-typing flex items-center gap-2 rounded-2xl border border-[var(--kk-smoke-heavy)] bg-white shadow-md px-3 h-12 w-full"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <button
                type="button"
                onClick={handleMicToggle}
                aria-label="Switch to voice"
                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-[var(--kk-ash)]"
              >
                <Mic className="h-4 w-4" strokeWidth={2} />
              </button>
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
                className="kk-text-bar-input flex-1"
                enterKeyHint="send"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <motion.button
                type="button"
                onClick={handleSubmit}
                disabled={!textValue.trim()}
                className="kk-text-bar-send flex-shrink-0"
                aria-label="Add expense"
                whileTap={{ scale: 0.88 }}
              >
                <ArrowUp className="h-[14px] w-[14px]" strokeWidth={2.5} />
              </motion.button>
            </motion.div>
          )}

          {pillState === "idle" && (
            <motion.div
              key="idle"
              className="kk-text-bar-idle flex items-center gap-3 rounded-2xl border border-transparent bg-[var(--kk-cream)] shadow-sm px-3 h-12 w-full"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            >
              <Keyboard className="h-4 w-4 text-[var(--kk-ash)] flex-shrink-0" strokeWidth={2} />
              <button
                type="button"
                onClick={expand}
                className="flex-1 min-w-0 text-left text-sm text-[var(--kk-ash)] bg-transparent border-none outline-none cursor-text overflow-hidden"
                tabIndex={0}
              >
                <motion.span
                  key={hintIndex}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  className="block truncate"
                >
                  {hint}
                </motion.span>
              </button>
              <button
                type="button"
                onClick={handleMicToggle}
                aria-label="Start recording"
                className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[var(--kk-ember)] text-white"
              >
                <Mic className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Bottom tab bar — simplified, no center FAB ── */}
      <div className="kk-bottom-tab-bar">
        {tabs.map((tab) => {
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
