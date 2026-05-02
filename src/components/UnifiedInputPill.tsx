"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/src/hooks/useIsMobile";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, ArrowUp, Check, Keyboard } from "lucide-react";
import { RecordingPill } from "@/src/components/RecordingPill";
import { EXAMPLES } from "@/src/components/RecordingStatus";
import type { AppTab } from "@/src/context/NavigationContext";

export interface TranscriptFeedback {
  txId: string;
  item: string;
  amount: number;
  category: string;
  paymentMethod: string;
  currencySymbol: string;
}

interface UnifiedInputPillProps {
  activeTab: AppTab;
  isRecording: boolean;
  isSpeaking?: boolean;
  isProcessing?: boolean;
  isEmpty?: boolean;
  onMicPress: () => void;
  onMicStart?: () => void;
  onMicStop?: () => void;
  onTextSubmit: (text: string) => void;
  transcriptFeedback?: TranscriptFeedback | null;
  onUndoTranscript?: () => void;
}

export const UnifiedInputPill = React.memo(({
  activeTab,
  isRecording,
  isSpeaking,
  isProcessing,
  isEmpty,
  onMicPress,
  onMicStart,
  onMicStop,
  onTextSubmit,
  transcriptFeedback,
  onUndoTranscript,
}: UnifiedInputPillProps) => {
  const isMobile = useIsMobile();
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

  // Collapse typing when recording/processing starts or feedback appears
  useEffect(() => {
    if (isRecording || isProcessing || transcriptFeedback) {
      setIsExpanded(false);
      setDisplayValue("");
      setTextValue("");
    }
  }, [isRecording, isProcessing, transcriptFeedback]);

  const handleMicToggle = (event?: React.SyntheticEvent) => {
    event?.preventDefault();
    if (navigator.vibrate) navigator.vibrate(50);
    onMicPress();
  };

  // Hold-to-record for mobile: pointerdown starts, pointerup/cancel on document stops.
  // We listen on document because the mic button unmounts (AnimatePresence swaps it for
  // RecordingPill) the moment recording starts, so setPointerCapture won't help.
  const handleMicPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobile) return;
    e.preventDefault(); // blocks long-press context menu
    if (navigator.vibrate) navigator.vibrate(50);
    onMicStart?.();
    const onRelease = () => {
      onMicStop?.();
      document.removeEventListener("pointerup", onRelease);
      document.removeEventListener("pointercancel", onRelease);
    };
    document.addEventListener("pointerup", onRelease);
    document.addEventListener("pointercancel", onRelease);
  }, [isMobile, onMicStart, onMicStop]);

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

  const expand = useCallback(() => {
    setIsExpanded(true);
  }, []);

  const hint = EXAMPLES[hintIndex];

  // Pill state machine — now 4 states
  const pillState: "recording" | "processing" | "feedback" | "typing" | "idle" =
    isProcessing ? "processing" :
      isRecording ? "recording" :
        transcriptFeedback ? "feedback" :
          isExpanded ? "typing" :
            "idle";

  // Hidden on non-entry tabs
  if (activeTab === "analytics" || activeTab === "profile") {
    return null;
  }

  return (
    <div className="kk-text-bar" aria-live="polite" aria-atomic="true">
      <AnimatePresence mode="wait" initial={false}>
        {(pillState === "recording" || pillState === "processing") && (
          <RecordingPill
            isRecording={pillState === "recording"}
            isSpeaking={pillState === "recording" && isSpeaking}
            isProcessing={pillState === "processing"}
            holdMode={isMobile}
            onStopRecording={handleMicToggle}
          />
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
            <button
              type="button"
              onClick={expand}
              aria-label="Type expense"
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-[var(--kk-ash)] hover:text-[var(--kk-ember)] transition-colors"
            >
              <Keyboard className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={expand}
              className="flex-1 min-w-0 text-left text-sm text-[var(--kk-ash)] bg-transparent border-none outline-none cursor-text overflow-hidden"
              tabIndex={0}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={hintIndex}
                  initial={{ clipPath: "inset(0 100% 0 0)", opacity: 0 }}
                  animate={{ clipPath: "inset(0 0% 0 0)", opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ clipPath: { duration: 0.8, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.2 } }}
                  className="block truncate"
                >
                  {hint}
                </motion.span>
              </AnimatePresence>
            </button>
            <span className={`relative flex-shrink-0${isEmpty ? " kk-mic-ring" : ""}`}>
              <button
                type="button"
                onClick={isMobile ? undefined : handleMicToggle}
                onPointerDown={isMobile ? handleMicPointerDown : undefined}
                onContextMenu={isMobile ? (e) => e.preventDefault() : undefined}
                aria-label="Start recording"
                className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-[var(--kk-ember)] text-white"
                style={isMobile ? { touchAction: "none" } : undefined}
              >
                <Mic className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

UnifiedInputPill.displayName = "UnifiedInputPill";
