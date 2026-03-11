"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MIC_CONFIG } from "@/src/config/mic";

interface RecordingStatusProps {
  isRecording: boolean;
  isProcessing: boolean;
  isReceiptProcessing: boolean;
  isTextProcessing?: boolean;
}

const AUTO_STOP_SECONDS = Math.ceil(MIC_CONFIG.hardTimeoutMs / 1000);

export const EXAMPLES = [
  "Aaj 500 ka petrol dalwaya...",         // Hindi/Hinglish
  "Auto ki 100 rupees kotta...",          // Telugu
  "groceries ke liye ₹1000...", // Hindi
  "Dudha sathi 50 rupaye dile...",        // Marathi
  "Meen vanga 200 aachu...",              // Tamil
  "Swiggy theke 350 takar khabar...",     // Bengali
  "netflix 199 monthly subscription",     // English
  "aaj chai piya 50 ka",
  "petrol 500 credit card se",
  "yearly health insurance 10000",
  "Biryani 350 upi",
  "auto kiraya 100",
];

export const RecordingStatus = React.memo(
  ({ isRecording, isProcessing, isReceiptProcessing, isTextProcessing }: RecordingStatusProps) => {
    const [recordingElapsed, setRecordingElapsed] = useState(0);
    const [exampleIndex, setExampleIndex] = useState(0);
    const intervalRef = useRef<number | null>(null);
    const exampleIntervalRef = useRef<number | null>(null);

    useEffect(() => {
      if (!isRecording) {
        setRecordingElapsed(0);
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (exampleIntervalRef.current) {
          window.clearInterval(exampleIntervalRef.current);
          exampleIntervalRef.current = null;
        }
        return;
      }

      const startedAt = Date.now();
      setRecordingElapsed(0);

      // Select a random starting index
      const randomIndex = Math.floor(Math.random() * EXAMPLES.length);
      setExampleIndex(randomIndex);

      intervalRef.current = window.setInterval(() => {
        setRecordingElapsed(Date.now() - startedAt);
      }, 200);

      // Rotate examples every 3 seconds
      exampleIntervalRef.current = window.setInterval(() => {
        setExampleIndex((prev) => (prev + 1) % EXAMPLES.length);
      }, 3000);

      return () => {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        if (exampleIntervalRef.current) {
          window.clearInterval(exampleIntervalRef.current);
          exampleIntervalRef.current = null;
        }
      };
    }, [isRecording]);

    const isVisible = isRecording || isProcessing || isReceiptProcessing;

    return (
      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24 }}
            className="mb-5 flex flex-col gap-2 rounded-2xl border border-[var(--kk-ember)]/20 bg-[var(--kk-ember)]/5 px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="h-2.5 w-2.5 rounded-full bg-[var(--kk-ember)]" />
                  {(isRecording || isReceiptProcessing) && (
                    <div className="absolute inset-0 animate-ping rounded-full bg-[var(--kk-ember)]" />
                  )}
                </div>
                <span className="text-sm font-medium text-[var(--kk-ink)]">
                  {isRecording
                    ? `Listening... ${Math.ceil(recordingElapsed / 1000)}s`
                    : isTextProcessing
                      ? "Processing..."
                      : isReceiptProcessing
                        ? "Processing receipt..."
                        : "Processing audio..."}
                </span>
              </div>
              {isRecording && (
                <span className="text-xs text-[var(--kk-ash)]">
                  Auto-stops in {Math.max(0, AUTO_STOP_SECONDS - Math.ceil(recordingElapsed / 1000))}s
                </span>
              )}
            </div>

            {isRecording && (
              <div className="overflow-hidden text-sm italic text-[var(--kk-ash)]">
                <span className="mr-1">Try saying:</span>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={exampleIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="inline-block"
                  >
                    "{EXAMPLES[exampleIndex]}"
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

RecordingStatus.displayName = "RecordingStatus";
