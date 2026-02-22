"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileUp,
} from "lucide-react";
import { useEscapeKey } from "@/src/hooks/useEscapeKey";
import { importTransactionsFromCsv, type ImportResult } from "@/src/db/db";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}

type Stage = "pick" | "importing" | "done";

const ACCEPTED = ".csv,text/csv";

export const ImportModal = React.memo(
  ({ isOpen, onClose, onImported }: ImportModalProps) => {
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [stage, setStage] = useState<Stage>("pick");
    const [fileName, setFileName] = useState<string | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [fatalError, setFatalError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const reset = useCallback(() => {
      setStage("pick");
      setFileName(null);
      setResult(null);
      setFatalError(null);
      setIsDragOver(false);
      if (fileRef.current) fileRef.current.value = "";
    }, []);

    const handleClose = useCallback(() => {
      reset();
      onClose();
    }, [reset, onClose]);

    useEscapeKey(isOpen, handleClose);

    const processFile = useCallback(
      async (file: File) => {
        setFileName(file.name);
        setStage("importing");
        setFatalError(null);
        try {
          const text = await file.text();
          const res = await importTransactionsFromCsv(text);
          setResult(res);
          setStage("done");
          if (res.imported > 0) {
            onImported?.();
          }
        } catch (err) {
          setFatalError(
            err instanceof Error ? err.message : "Something went wrong"
          );
          setStage("done");
        }
      },
      [onImported]
    );

    const handleFileChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
      },
      [processFile]
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.name.endsWith(".csv")) {
          processFile(file);
        }
      },
      [processFile]
    );

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    }, []);

    const downloadTemplate = useCallback(() => {
      const csv = [
        "Date,Amount,Item,Category,PaymentMethod",
        "21-02-2026,50,Coffee,Food,upi",
        "20-02-2026,1200,Groceries,Shopping,card",
      ].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "kharchakitab_import_template.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, []);

    /* ----- result helpers ----- */
    const hasErrors = (result?.errors.length ?? 0) > 0;
    const isSuccess = result && result.imported > 0 && !fatalError;
    const isPartial = isSuccess && hasErrors;
    const isAllSkipped =
      result && result.imported === 0 && result.skipped > 0 && !fatalError;
    const isFailure = fatalError || (result && result.imported === 0 && hasErrors);

    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);
    if (!mounted) return null;

    return createPortal(
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[60] flex items-end justify-center bg-[var(--kk-void)]/40 px-4 pt-4 pb-24 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleClose();
            }}
          >
            <motion.div
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0 }}
              transition={{
                type: "spring",
                damping: 30,
                stiffness: 300,
              }}
              className="w-full max-w-md overflow-hidden kk-radius-xl border border-[var(--kk-smoke)] bg-[var(--kk-cream)] kk-shadow-lg max-h-[90vh] overflow-y-auto"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="h-1 w-10 rounded-full bg-[var(--kk-smoke-heavy)]" />
              </div>

              <div className="px-5 pb-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--kk-ash)]">
                      Import
                    </div>
                    <div className="mt-1 text-2xl font-semibold font-[family:var(--font-display)] text-[var(--kk-ink)]">
                      Import expenses
                    </div>
                    <div className="mt-2 text-[11px] leading-relaxed text-[var(--kk-ash)]">
                      <span className="font-medium text-[var(--kk-ink)]">
                        Required:
                      </span>{" "}
                      Date, Amount, Item.{" "}
                      <br />
                      <span className="font-medium text-[var(--kk-ink)]">
                        Optional:
                      </span>{" "}
                      Id, Category, PaymentMethod.
                      <br />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="kk-icon-btn mt-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* ── STAGE: Pick file ── */}
                {stage === "pick" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24, delay: 0.06 }}
                  >
                    <input
                      ref={fileRef}
                      type="file"
                      accept={ACCEPTED}
                      className="hidden"
                      onChange={handleFileChange}
                    />

                    {/* Drop zone */}
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      className={`mt-5 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all ${isDragOver
                        ? "border-[var(--kk-ember)] bg-[var(--kk-ember)]/[0.04] scale-[1.01]"
                        : "border-[var(--kk-smoke-heavy)] bg-white hover:border-[var(--kk-ember)]/50 hover:bg-[var(--kk-ember)]/[0.02]"
                        }`}
                    >
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${isDragOver
                          ? "bg-[var(--kk-ember)]/15"
                          : "bg-[var(--kk-cream)]"
                          }`}
                      >
                        <FileUp
                          className={`h-5 w-5 transition-colors ${isDragOver
                            ? "text-[var(--kk-ember)]"
                            : "text-[var(--kk-ash)]"
                            }`}
                        />
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-medium text-[var(--kk-ink)]">
                          Choose CSV file
                        </span>
                        <span className="mt-1 block text-[11px] text-[var(--kk-ash)]">
                          or drag &amp; drop here
                        </span>
                      </div>
                    </button>

                    {/* Template download */}
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="mt-4 w-full kk-btn-secondary kk-btn-compact"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download template
                    </button>
                  </motion.div>
                )}

                {/* ── STAGE: Importing ── */}
                {stage === "importing" && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.24 }}
                    className="mt-6 flex flex-col items-center gap-4 py-8"
                  >
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--kk-ember)]" />
                      <FileSpreadsheet className="h-5 w-5 text-[var(--kk-ember)]" />
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-medium text-[var(--kk-ink)]">
                        Importing expenses…
                      </div>
                      {fileName && (
                        <div className="mt-1 text-[11px] text-[var(--kk-ash)]">
                          {fileName}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* ── STAGE: Done ── */}
                {stage === "done" && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28 }}
                    className="mt-5"
                  >
                    {/* Success / Partial / Failure banner */}
                    <div
                      className={`flex items-start gap-3 kk-radius-xl border p-4 ${isFailure
                        ? "border-[var(--kk-danger)]/20 bg-[var(--kk-danger)]/[0.04]"
                        : isAllSkipped
                          ? "border-[var(--kk-saffron)]/30 bg-[var(--kk-saffron)]/[0.06]"
                          : isPartial
                            ? "border-[var(--kk-saffron)]/30 bg-[var(--kk-saffron)]/[0.06]"
                            : "border-[var(--kk-sage)]/20 bg-[var(--kk-sage)]/[0.04]"
                        }`}
                    >
                      <div className="mt-0.5 flex-none">
                        {isFailure ? (
                          <XCircle className="h-5 w-5 text-[var(--kk-danger)]" />
                        ) : isAllSkipped || isPartial ? (
                          <AlertTriangle className="h-5 w-5 text-[var(--kk-saffron)]" />
                        ) : (
                          <CheckCircle2 className="h-5 w-5 text-[var(--kk-sage)]" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-[var(--kk-ink)]">
                          {fatalError
                            ? "Import failed"
                            : isAllSkipped
                              ? "All rows skipped"
                              : isFailure
                                ? "No rows imported"
                                : isPartial
                                  ? "Imported with issues"
                                  : "Import successful"}
                        </div>
                        <div className="mt-1 text-xs text-[var(--kk-ash)]">
                          {fatalError ??
                            buildSummary(
                              result!.imported,
                              result!.skipped,
                              result!.errors.length
                            )}
                        </div>
                      </div>
                    </div>

                    {/* Error details (collapsible-feeling, show first 5) */}
                    {hasErrors && result && (
                      <div className="mt-3 kk-radius-xl border border-[var(--kk-smoke)] bg-white p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kk-ash)]">
                          Row errors
                          {result.errors.length > 5 && (
                            <span className="normal-case tracking-normal font-normal">
                              {" "}
                              (showing first 5 of {result.errors.length})
                            </span>
                          )}
                        </div>
                        <div className="mt-2.5 space-y-2">
                          {result.errors.slice(0, 5).map((err) => (
                            <div
                              key={`${err.row}-${err.reason}`}
                              className="flex gap-2 text-xs"
                            >
                              <span className="flex-none font-[family:var(--font-mono)] text-[var(--kk-ash)]">
                                Row {err.row}
                              </span>
                              <span className="text-[var(--kk-ink)]">
                                {err.reason}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="mt-5 flex gap-3">
                      {(isFailure || isPartial || isAllSkipped) && (
                        <button
                          type="button"
                          onClick={reset}
                          className="kk-btn-secondary kk-btn-compact flex-1"
                        >
                          <Upload className="h-3.5 w-3.5" />
                          Try again
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClose}
                        className={`flex-1 ${isSuccess && !isPartial
                          ? "kk-btn-primary"
                          : "kk-btn-secondary kk-btn-compact"
                          }`}
                      >
                        Done
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
    );
  }
);

ImportModal.displayName = "ImportModal";

/* ── Helpers ── */

function buildSummary(imported: number, skipped: number, errors: number) {
  const parts: string[] = [];
  if (imported > 0)
    parts.push(`${imported} expense${imported === 1 ? "" : "s"} imported`);
  if (skipped > 0)
    parts.push(`${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`);
  if (errors > 0)
    parts.push(`${errors} row${errors === 1 ? "" : "s"} had errors`);
  return parts.join(" · ") || "No data processed";
}
