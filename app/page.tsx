"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppProvider, useAppContext } from "@/src/context/AppContext";
import { MicButton } from "@/src/components/MicButton";
import { EditModal } from "@/src/components/EditModal";
import { TransactionList } from "@/src/components/TransactionList";
import { HistoryView } from "@/src/components/HistoryView";
import { RecordingStatus } from "@/src/components/RecordingStatus";
import { HouseholdView } from "@/src/components/HouseholdView";
import { useAudioRecorder } from "@/src/hooks/useAudioRecorder";
import { usePresence } from "@/src/hooks/usePresence";
import { parseWithGeminiFlash } from "@/src/services/gemini";
import { parseReceiptWithGemini } from "@/src/services/receipt";
import { transcribeAudio } from "@/src/services/sarvam";
import {
  addTransaction,
  deleteTransaction,
  getDeviceIdentity,
  updateTransaction,
  isTransactionShared,
} from "@/src/db/db";
import type { Expense } from "@/src/utils/schemas";
import type { Transaction } from "@/src/types";
import { AlertCircle, PenLine, ImageUp } from "lucide-react";
import { prepareReceiptImage } from "@/src/utils/imageProcessing";
import {
  DISMISS_TRANSCRIPTS,
  MIN_AUDIO_DURATION_MS,
  MIN_AUDIO_SIZE_BYTES,
} from "@/src/config/mic";
import { ERROR_MESSAGES, toUserMessage } from "@/src/utils/error";
import posthog from "posthog-js";

type TransactionInput = Omit<Transaction, "id">;

const buildTransaction = (
  data: TransactionInput,
  id = ""
): Transaction => ({
  id,
  amount: data.amount,
  item: data.item,
  category: data.category,
  paymentMethod: data.paymentMethod,
  timestamp: data.timestamp,
  source: data.source ?? "unknown",
  is_private: data.is_private ?? false,
});

const formatDateYMD = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toTimestamp = (date: string | undefined, baseTime: number) => {
  if (!date) return baseTime;
  const base = new Date(baseTime);
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return baseTime;
  const merged = new Date(
    year,
    month - 1,
    day,
    base.getHours(),
    base.getMinutes(),
    base.getSeconds(),
    base.getMilliseconds()
  );
  return Number.isNaN(merged.getTime()) ? baseTime : merged.getTime();
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,/i);
  const mimeType = match?.[1] || "application/octet-stream";
  const base64Marker = ";base64,";
  const base64Index = dataUrl.indexOf(base64Marker);
  const raw = base64Index >= 0 ? dataUrl.slice(base64Index + base64Marker.length) : "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
};

const AppShell = () => {
  const { isRecording, setIsRecording } = useAppContext();
  // Initialize presence at app level for discoverability
  const { isConnected, error } = usePresence();
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [editedTx, setEditedTx] = useState<Transaction | null>(null);
  const [addedTx, setAddedTx] = useState<Transaction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editState, setEditState] = useState<{
    mode: "new" | "edit";
    id?: string;
    amount: number;
    item: string;
    category: string;
    paymentMethod?: "cash" | "upi" | "card" | "unknown";
    timestamp?: number;
    isPrivate?: boolean;
    isShared?: boolean;
  } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTxnSheetOpen, setIsTxnSheetOpen] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [isReceiptProcessing, setIsReceiptProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<"personal" | "household">(
    "personal"
  );
  // Show by default on localhost, or if PostHog is not enabled
  const [showHousehold, setShowHousehold] = useState(false);

  useEffect(() => {
    setShowHousehold(
      window.location.hostname === "localhost" || process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== "true"
    );
  }, []);

  useEffect(() => {
    // Only check feature flags if PostHog is enabled for prod
    if (process.env.NEXT_PUBLIC_POSTHOG_ENABLED === "true") {
      posthog.onFeatureFlags(() => {
        const isEnabled = posthog.isFeatureEnabled("household-view");
        // Only update if it's not already true (to preserve localhost override)
        if (isEnabled) {
          setShowHousehold(true);
        } else if (window.location.hostname !== "localhost") {
          setShowHousehold(false);
        }
      });
    }
  }, []);
  const processedBlobRef = useRef<Blob | null>(null);
  const processingRef = useRef(false);
  const receiptProcessingRef = useRef(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const audioRecorder = useAudioRecorder();
  useEffect(() => {
    const stored = window.localStorage.getItem("kk_about_visible");
    setIsAboutVisible(stored !== "false");
  }, []);
  useEffect(() => {
    void getDeviceIdentity();
  }, []);
  useEffect(() => {
    setIsRecording(audioRecorder.isRecording);
    if (audioRecorder.isRecording) {
      setLastError(null);
      // Clean up old blob to prevent memory leak
      setLastAudioBlob(null);
    }
  }, [audioRecorder.isRecording, setIsRecording]);

  useEffect(() => {
    if (audioRecorder.error) {
      setLastError(audioRecorder.error);
    }
  }, [audioRecorder.error]);

  useEffect(() => {
    const shouldLock = isHistoryOpen || isEditing;
    const html = document.documentElement;
    const { body } = document;
    if (shouldLock) {
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
    } else {
      html.style.overflow = "";
      body.style.overflow = "";
    }
    return () => {
      html.style.overflow = "";
      body.style.overflow = "";
    };
  }, [isHistoryOpen, isEditing]);

  useEffect(() => {
    if (audioRecorder.isRecording) return;
    const blob = audioRecorder.audioBlob;
    if (!blob || blob === processedBlobRef.current) return;
    const validationError = getAudioValidationError(
      blob,
      audioRecorder.duration
    );
    if (validationError) {
      setLastError(validationError);
      return;
    }
    processedBlobRef.current = blob;
    setLastAudioBlob(blob);
    void processAudioBlob(blob);
  }, [audioRecorder.audioBlob, audioRecorder.isRecording, audioRecorder.duration]);

  useEffect(() => {
    const shared = window.sessionStorage.getItem("kk_share_image");
    if (!shared) return;
    window.sessionStorage.removeItem("kk_share_image");
    void processReceiptDataUrl(shared);
  }, []);

  const refreshTransactions = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const startProcessing = () => {
    if (processingRef.current) return false;
    processingRef.current = true;
    setIsProcessing(true);
    return true;
  };

  const stopProcessing = () => {
    setIsProcessing(false);
    processingRef.current = false;
  };

  const startReceiptProcessing = () => {
    if (receiptProcessingRef.current) return false;
    receiptProcessingRef.current = true;
    setIsReceiptProcessing(true);
    return true;
  };

  const stopReceiptProcessing = () => {
    setIsReceiptProcessing(false);
    receiptProcessingRef.current = false;
  };

  const addPendingTransaction = async () => {
    const tempId = await addTransaction({
      id: "",
      amount: 0,
      item: "Processing…",
      category: "Other",
      paymentMethod: "unknown",
      timestamp: Date.now(),
      source: "unknown",
    });
    refreshTransactions();
    return tempId;
  };

  const removePendingTransaction = async (tempId: string) => {
    await deleteTransaction(tempId);
    refreshTransactions();
  };

  const parseTranscript = async (text: string) => {
    const trimmed = text.trim();
    const fallback: Expense = {
      amount: 50,
      item: trimmed || "Auto",
      category: "Travel",
      date: formatDateYMD(new Date()),
      paymentMethod: "cash",
      confidence: 0.4,
    };

    try {
      return await parseWithGeminiFlash(trimmed);
    } catch (error) {
      return fallback;
    }
  };

  const handleStartRecording = useCallback(async () => {
    setLastError(null); // Clear any previous errors
    posthog.capture("recording_started");
    await audioRecorder.startRecording();
  }, [audioRecorder]);

  const getAudioValidationError = (blob: Blob | null, durationMs: number) => {
    if (!blob) return ERROR_MESSAGES.noAudioCaptured;
    if (durationMs > 0 && durationMs < MIN_AUDIO_DURATION_MS) {
      return ERROR_MESSAGES.recordingTooShort;
    }
    if (blob.size < MIN_AUDIO_SIZE_BYTES) {
      return ERROR_MESSAGES.recordingTooShort;
    }
    return null;
  };

  const processAudioBlob = async (audioBlob: Blob) => {
    // Prevent duplicate processing (race condition)
    if (!startProcessing()) return;
    setLastError(null);
    const tempId = await addPendingTransaction();
    try {
      const text = await transcribeAudio(audioBlob);
      const normalized = text.trim().toLowerCase();
      if (DISMISS_TRANSCRIPTS.has(normalized)) {
        await removePendingTransaction(tempId);
        stopProcessing();
        return;
      }
      const expense = await parseTranscript(text || "Auto 50");
      const now = Date.now();
      if (expense.amount <= 0) {
        await removePendingTransaction(tempId);
        setLastError(ERROR_MESSAGES.amountGreaterThanZero);
        stopProcessing();
        return;
      }
      const updatedTx: Transaction = {
        id: tempId,
        amount: expense.amount,
        item: expense.item,
        category: expense.category,
        paymentMethod: expense.paymentMethod ?? "cash",
        timestamp: toTimestamp(expense.date, now),
      };
      await updateTransaction(
        tempId,
        {
          amount: expense.amount,
          item: expense.item,
          category: expense.category,
          paymentMethod: expense.paymentMethod ?? "cash",
          timestamp: toTimestamp(expense.date, now),
          source: "voice",
        },
        { source: "voice" }
      );
      setEditedTx(updatedTx);
      refreshTransactions();
      posthog.capture("transaction_added", {
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.paymentMethod ?? "cash",
        source: "voice",
      });
    } catch (error) {
      await removePendingTransaction(tempId);
      setLastError(toUserMessage(error, "unableToTranscribeAudio"));
      posthog.capture("error_occurred", {
        error_type: "transcription_failed",
        error_message: toUserMessage(error, "unableToTranscribeAudio"),
      });
    } finally {
      stopProcessing();
    }
  };

  const processReceiptDataUrl = async (dataUrl: string) => {
    if (!startReceiptProcessing()) return;
    setLastError(null);
    const tempId = await addTransaction({
      id: "",
      amount: 0,
      item: "Processing receipt...",
      category: "Other",
      paymentMethod: "unknown",
      timestamp: Date.now(),
    });
    refreshTransactions();
    try {
      const prefix = dataUrl.slice(0, 64);
      const blob = dataUrlToBlob(dataUrl);
      const normalized = await prepareReceiptImage(blob);
      const expense = await parseReceiptWithGemini(normalized);
      const now = Date.now();
      if (expense.amount <= 0) {
        throw new Error(ERROR_MESSAGES.amountGreaterThanZero);
      }
      const updatedTx: Transaction = {
        id: tempId,
        amount: expense.amount,
        item: expense.item,
        category: expense.category,
        paymentMethod: expense.paymentMethod ?? "cash",
        timestamp: toTimestamp(expense.date, now),
      };
      await updateTransaction(
        tempId,
        {
          amount: expense.amount,
          item: expense.item,
          category: expense.category,
          paymentMethod: expense.paymentMethod ?? "cash",
          timestamp: toTimestamp(expense.date, now),
          source: "receipt",
        },
        { source: "receipt" }
      );
      setEditedTx(updatedTx);
      refreshTransactions();
      posthog.capture("receipt_processed", {
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.paymentMethod ?? "cash",
      });
      posthog.capture("transaction_added", {
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.paymentMethod ?? "cash",
        source: "receipt",
      });
    } catch (error) {
      await removePendingTransaction(tempId);
      setLastError(toUserMessage(error, "unableToProcessReceipt"));
      posthog.capture("error_occurred", {
        error_type: "receipt_processing_failed",
        error_message: toUserMessage(error, "unableToProcessReceipt"),
      });
    } finally {
      stopReceiptProcessing();
    }
  };

  const handleReceiptUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    posthog.capture("receipt_upload_started", {
      file_type: file.type,
      file_size_bytes: file.size,
    });
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(result);
        };
        reader.onerror = () =>
          reject(new Error(ERROR_MESSAGES.unableToReadReceiptImage));
        reader.readAsDataURL(file);
      });
      event.target.value = "";
      await processReceiptDataUrl(dataUrl);
    } catch (error) {
      setLastError(toUserMessage(error, "unableToReadReceiptImage"));
      posthog.capture("error_occurred", {
        error_type: "receipt_read_failed",
        error_message: toUserMessage(error, "unableToReadReceiptImage"),
      });
    }
  };

  const handleStopRecording = useCallback(async () => {
    const { audioBlob, duration } = await audioRecorder.stopRecording();
    posthog.capture("recording_stopped", {
      duration_ms: duration,
      blob_size_bytes: audioBlob?.size ?? 0,
    });
    const validationError = getAudioValidationError(audioBlob, duration);
    if (validationError) {
      setLastError(validationError);
      posthog.capture("error_occurred", {
        error_type: "recording_validation",
        error_message: validationError,
      });
      return;
    }
    if (!audioBlob) {
      setLastError(ERROR_MESSAGES.noAudioCaptured);
      posthog.capture("error_occurred", {
        error_type: "no_audio_captured",
        error_message: ERROR_MESSAGES.noAudioCaptured,
      });
      return;
    }
    processedBlobRef.current = audioBlob;
    setLastAudioBlob(audioBlob);
    await processAudioBlob(audioBlob);
  }, [audioRecorder]);

  const todayLabel = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const openEdit = useCallback(async (tx: Transaction) => {
    const isShared = await isTransactionShared(tx.id);
    setEditState({
      mode: "edit",
      id: tx.id,
      amount: tx.amount,
      item: tx.item,
      category: tx.category,
      paymentMethod: tx.paymentMethod,
      timestamp: tx.timestamp,
      isPrivate: tx.is_private ?? false,
      isShared,
    });
    setIsEditing(true);
  }, []);

  const handleOpenHistory = useCallback(() => {
    setIsHistoryOpen(true);
    posthog.capture("history_viewed");
  }, []);

  const handleTransactionDeleted = useCallback(
    (tx: Transaction) => {
      setDeletedTx(tx);
      refreshTransactions();
      posthog.capture("transaction_deleted", {
        amount: tx.amount,
        category: tx.category,
        payment_method: tx.paymentMethod,
      });
    },
    [refreshTransactions]
  );

  const handleCloseEdit = useCallback(() => {
    setIsEditing(false);
    setEditState(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (data: {
      amount: number;
      item: string;
      category: string;
      paymentMethod: "cash" | "upi" | "card" | "unknown";
      timestamp: number;
      isPrivate?: boolean;
    }) => {
      if (data.amount <= 0) {
        setLastError(ERROR_MESSAGES.amountGreaterThanZero);
        return;
      }
      if (editState?.mode === "edit" && editState.id) {
        const updated = buildTransaction(
          {
            ...data,
            source: "manual",
            is_private: data.isPrivate ?? false,
          },
          editState.id
        );
        await updateTransaction(editState.id, updated, { source: "manual" });
        setEditedTx(updated);
        posthog.capture("transaction_edited", {
          amount: data.amount,
          category: data.category,
          payment_method: data.paymentMethod,
        });
      } else {
        const transaction = buildTransaction({
          ...data,
          source: "manual",
          is_private: data.isPrivate ?? false,
        });
        const id = await addTransaction(transaction);
        setAddedTx({ ...transaction, id });
        posthog.capture("transaction_added", {
          amount: data.amount,
          category: data.category,
          payment_method: data.paymentMethod,
          source: "manual",
        });
      }
      setRefreshKey((prev) => prev + 1);
      setIsEditing(false);
      setEditState(null);
    },
    [editState]
  );

  const handleCloseHistory = useCallback(() => {
    setIsHistoryOpen(false);
  }, []);

  const handleHistoryDeleted = useCallback((tx: Transaction) => {
    setDeletedTx(tx);
    setRefreshKey((prev) => prev + 1);
  }, []);

  return (
    <div className="relative min-h-screen bg-[var(--kk-paper)] pb-28 text-[var(--kk-ink)]">
      {/* Background gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <motion.div
          className="kk-gradient-orb kk-gradient-orb-ember absolute -right-32 top-20 h-96 w-96"
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.4, 0.5, 0.4],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="kk-gradient-orb kk-gradient-orb-saffron absolute -left-20 top-1/3 h-80 w-80"
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.3, 0.4, 0.3],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        />
        <div className="kk-gradient-orb kk-gradient-orb-ink absolute bottom-20 left-1/2 h-[500px] w-[500px] -translate-x-1/2" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div aria-hidden />
            <div className="min-w-0 text-center">
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="kk-label"
              >
                {todayLabel}
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="mt-0.5 text-2xl font-bold font-[family:var(--font-display)] tracking-tight"
              >
                Kharcha<span className="text-[var(--kk-ember)]">Kitab</span>
              </motion.h1>
            </div>
            <div className="justify-self-end">
              <button
                type="button"
                onClick={() => receiptInputRef.current?.click()}
                disabled={isReceiptProcessing}
                aria-label="Upload receipt"
                title="Upload receipt"
                className="kk-icon-btn kk-icon-btn-ghost text-[var(--kk-ember)]"
              >
                <ImageUp className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6">
        {showHousehold && (
          <div className="mb-6 flex items-center justify-center">
            <div className="flex rounded-full border border-[var(--kk-smoke)] bg-white/70 p-1 shadow-[var(--kk-shadow-sm)]">
              {(["personal", "household"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${activeTab === tab
                    ? "bg-[var(--kk-ember)] text-white"
                    : "text-[var(--kk-ink)] hover:bg-[var(--kk-cream)]"
                    }`}
                >
                  {tab === "personal" ? "Personal" : "Household"}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === "personal" && isAboutVisible && (
          <section className="mb-6 kk-card px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="kk-label">About</div>
                <h2 className="mt-2 text-lg font-semibold text-[var(--kk-ink)]">
                  Hinglish expense tracking, built for everyday spending.
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAboutVisible(false);
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("kk_about_visible", "false");
                  }
                  posthog.capture("about_dismissed");
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ash)] transition hover:bg-[var(--kk-smoke-heavy)] hover:text-[var(--kk-ink)]"
                aria-label="Dismiss about card"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--kk-ash)]">
              Speak your expenses or share a receipt screenshot to auto-capture totals and categories. Your ledger stays on device.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="kk-chip">Hinglish-first</span>
              <span className="kk-chip">Voice input</span>
              <span className="kk-chip">Share receipts</span>
              <span className="kk-chip">Quick edits</span>
              <span className="kk-chip">Auto categories</span>
            </div>
          </section>
        )}
        {activeTab === "personal" ? (
          <>
            {/* Error Banner */}
            <AnimatePresence>
              {lastError && (
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.24 }}
                  className="mb-5 overflow-hidden rounded-[var(--kk-radius-lg)] border border-[rgba(229,72,77,0.24)] bg-[rgba(229,72,77,0.06)] px-4 py-3 shadow-[var(--kk-shadow-sm)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(229,72,77,0.25)] bg-white text-[var(--kk-danger-ink)]">
                      <AlertCircle className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0 text-sm font-semibold text-[var(--kk-danger-ink)]">
                          {lastError}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setLastError(null);
                            setEditState({
                              mode: "new",
                              amount: 0,
                              item: "",
                              category: "Food",
                            });
                            setIsEditing(true);
                            posthog.capture("manual_entry_opened");
                          }}
                          className="kk-btn-secondary kk-btn-compact"
                        >
                          <PenLine className="h-3 w-3" />
                          Enter manually
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recording/Processing Status */}
            <RecordingStatus
              isRecording={isRecording}
              isProcessing={isProcessing}
              isReceiptProcessing={isReceiptProcessing}
            />

            {/* Transaction List */}
            <section>
              <TransactionList
                refreshKey={refreshKey}
                addedTx={addedTx}
                deletedTx={deletedTx}
                editedTx={editedTx}
                onViewAll={handleOpenHistory}
                onEdit={openEdit}
                onMobileSheetChange={setIsTxnSheetOpen}
                onDeleted={handleTransactionDeleted}
              />
            </section>
          </>
        ) : (
          <HouseholdView />
        )}
      </main>

      {/* Mic Button */}
      {!isTxnSheetOpen && activeTab === "personal" && (
        <MicButton
          isRecording={isRecording}
          startRecording={handleStartRecording}
          stopRecording={handleStopRecording}
        />
      )}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReceiptUpload}
      />

      {/* Edit Modal */}
      <EditModal
        isOpen={isEditing}
        mode={editState?.mode}
        amount={editState?.amount ?? 0}
        item={editState?.item ?? ""}
        category={editState?.category ?? "Food"}
        paymentMethod={editState?.paymentMethod ?? "cash"}
        timestamp={editState?.timestamp ?? Date.now()}
        isPrivate={editState?.isPrivate ?? false}
        isShared={editState?.isShared ?? false}
        onClose={handleCloseEdit}
        onSave={handleSaveEdit}
      />

      {/* History View */}
      <HistoryView
        isOpen={isHistoryOpen}
        onClose={handleCloseHistory}
        onDeleted={handleHistoryDeleted}
        refreshKey={refreshKey}
        editedTx={editedTx}
        onEdit={openEdit}
      />
    </div>
  );
};

export default function Home() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}
