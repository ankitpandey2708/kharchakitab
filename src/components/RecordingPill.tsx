"use client";

import React from "react";
import { motion } from "framer-motion";
import { Square, Loader2 } from "lucide-react";

interface RecordingPillProps {
    isRecording: boolean;
    isSpeaking?: boolean;
    isProcessing?: boolean;
    holdMode?: boolean;
    onStopRecording: (event?: React.SyntheticEvent) => void;
}

export const RecordingPill = React.memo(({
    isRecording,
    isSpeaking,
    isProcessing,
    holdMode,
    onStopRecording,
}: RecordingPillProps) => {
    if (isRecording) {
        return (
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
                    onClick={onStopRecording}
                    aria-label="Stop recording"
                    className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-[var(--kk-ember)] text-white animate-ember-pulse"
                >
                    <Square className="h-3 w-3 fill-current" strokeWidth={0} />
                </button>
                {/* Animated waveform bars — faster/taller when speaking */}
                <div className="flex items-center gap-[3px] flex-1 justify-center" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((i) => (
                        <span
                            key={i}
                            className={isSpeaking ? "kk-wave-bar kk-wave-bar--active" : "kk-wave-bar kk-wave-bar--idle"}
                            style={{ animationDelay: `${i * 0.1}s` }}
                        />
                    ))}
                </div>
                <span className="text-xs font-medium text-[var(--kk-ember)] flex-shrink-0">
                    {holdMode ? "release to send" : isSpeaking ? "speaking…" : "listening…"}
                </span>
            </motion.div>
        );
    }

    if (isProcessing) {
        return (
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
        );
    }

    return null;
});

RecordingPill.displayName = "RecordingPill";
