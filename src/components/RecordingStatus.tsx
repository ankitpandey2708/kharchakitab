"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MIC_CONFIG } from "@/src/config/mic";

interface RecordingStatusProps {
  isRecording: boolean;
  isProcessing: boolean;
  isReceiptProcessing: boolean;
}

const AUTO_STOP_SECONDS = Math.ceil(MIC_CONFIG.hardTimeoutMs / 1000);

export const RecordingStatus = React.memo(
  ({ isRecording, isProcessing, isReceiptProcessing }: RecordingStatusProps) => {
    const [recordingElapsed, setRecordingElapsed] = useState(0);
    const intervalRef = useRef<number | null>(null);

    useEffect(() => {
      if (!isRecording) {
        setRecordingElapsed(0);
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }

      const startedAt = Date.now();
      setRecordingElapsed(0);
      intervalRef.current = window.setInterval(() => {
        setRecordingElapsed(Date.now() - startedAt);
      }, 200);

      return () => {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [isRecording]);

    const isVisible = isRecording || isProcessing || isReceiptProcessing;

    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24 }}
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--kk-ember)]/20 bg-[var(--kk-ember)]/5 px-4 py-3"
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

RecordingStatus.displayName = "RecordingStatus";
