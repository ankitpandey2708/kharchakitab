"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, ArrowUp, Square, X, Loader2, Zap, RotateCw, AlertCircle, CheckCircle2 } from "lucide-react";
import { usePageAgent } from "@/src/hooks/usePageAgent";
import type { AgentActivity } from "@/src/hooks/usePageAgent";

const SUGGESTIONS = [
  "Delete my last expense",
  "Set monthly budget to 20000",
  "Show food expenses this month",
  "Add Netflix as monthly recurring",
];

const ActivityLine = ({ activity }: { activity: AgentActivity }) => {
  switch (activity.type) {
    case "thinking":
      return (
        <>
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
          <span>Thinking…</span>
        </>
      );
    case "executing":
      return (
        <>
          <Zap className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">Running <strong>{String(activity.tool)}</strong></span>
        </>
      );
    case "executed":
      return (
        <>
          <Zap className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">Ran <strong>{String(activity.tool)}</strong> ({activity.duration}ms)</span>
        </>
      );
    case "retrying":
      return (
        <>
          <RotateCw className="h-3 w-3 flex-shrink-0" />
          <span>Retrying ({activity.attempt}/{activity.maxAttempts})</span>
        </>
      );
    case "error":
      return (
        <>
          <AlertCircle className="h-3 w-3 flex-shrink-0" />
          <span className="truncate">{activity.message}</span>
        </>
      );
  }
};

export const AgentFab = React.memo(() => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { execute, stop, reset, status, activity } = usePageAgent();
  const running = status === "running";

  // Focus input when opened
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const handleToggle = useCallback(() => {
    if (running) return;
    setOpen((prev) => {
      if (!prev) {
        setInput("");
        reset();
      }
      return !prev;
    });
  }, [running, reset]);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || running) return;
    setInput("");
    await execute(trimmed);
  }, [input, running, execute]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
      if (e.key === "Escape" && !running) setOpen(false);
    },
    [handleSubmit, running]
  );

  const handleSuggestion = useCallback(
    async (s: string) => {
      if (running) return;
      setInput("");
      await execute(s);
    },
    [running, execute]
  );

  return (
    <div data-page-agent-not-interactive>
      {/* Backdrop */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="kk-agent-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !running && setOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Agent panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="kk-agent-panel"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {/* Header */}
            <div className="kk-agent-panel-header">
              <Bot className="h-3.5 w-3.5" strokeWidth={2.5} />
              <span className="kk-agent-panel-title">Agent</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="kk-agent-close"
                aria-label="Close agent"
                disabled={running}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>

            {/* Suggestions — visible whenever agent isn't running */}
            {!running && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.08 }}
                className="kk-agent-suggestions"
              >
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSuggestion(s)}
                    className="kk-agent-chip"
                  >
                    {s}
                  </button>
                ))}
              </motion.div>
            )}

            {/* Activity / result status */}
            <AnimatePresence mode="wait">
              {running && activity && (
                <motion.div
                  key={`activity-${activity.type}`}
                  className="kk-agent-activity"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <ActivityLine activity={activity} />
                </motion.div>
              )}
              {!running && status === "completed" && (
                <motion.div
                  key="result-done"
                  className="kk-agent-activity kk-agent-activity-done"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                  <span>Done</span>
                </motion.div>
              )}
              {!running && status === "error" && (
                <motion.div
                  key="result-error"
                  className="kk-agent-activity kk-agent-activity-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <AlertCircle className="h-3 w-3 flex-shrink-0" />
                  <span>Something went wrong</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input row */}
            <div className="kk-agent-input-row">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={running ? "Agent is working\u2026" : "What should I do?"}
                disabled={running}
                className="kk-agent-input"
                autoComplete="off"
                spellCheck={false}
              />
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="kk-agent-stop"
                  aria-label="Stop agent"
                >
                  <Square className="h-3 w-3 fill-current" strokeWidth={0} />
                </button>
              ) : (
                <motion.button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!input.trim()}
                  className="kk-text-bar-send flex-shrink-0"
                  aria-label="Execute command"
                  whileTap={{ scale: 0.88 }}
                >
                  <ArrowUp className="h-[14px] w-[14px]" strokeWidth={2.5} />
                </motion.button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        type="button"
        onClick={handleToggle}
        className={`kk-agent-fab ${open ? "kk-agent-fab-active" : ""}`}
        aria-label={open ? "Close agent" : "Open agent"}
        whileTap={{ scale: 0.88 }}
        layout
      >
        <Bot className="h-[18px] w-[18px]" strokeWidth={2.2} />
      </motion.button>
    </div>
  );
});

AgentFab.displayName = "AgentFab";
