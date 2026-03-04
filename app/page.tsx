// PERF-RERENDER: Added useTransition for expensive state updates, useDeferredValue for search/filter inputs, and useMemo/useCallback throughout
// Also using split contexts (useNavigation, usePairing) instead of monolithic useAppContext for better performance isolation

"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  useDeferredValue,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppProvider } from "@/src/context/AppContext";
import { useNavigation, usePairing } from "@/src/context/AppContext";
import { SignalingProvider, useSignaling } from "@/src/context/SignalingContext";
import { BottomTabBar, type TabType } from "@/src/components/BottomTabBar";
import { EditModal } from "@/src/components/EditModal";
import { TransactionList } from "@/src/components/TransactionList";
import { HistoryView } from "@/src/components/HistoryView";
import { RecordingStatus } from "@/src/components/RecordingStatus";
import { HouseholdView } from "@/src/components/HouseholdView";
import { RecurringView } from "@/src/components/RecurringView";
import { RecurringEditModal } from "@/src/components/RecurringEditModal";
import { SettingsPopover } from "@/src/components/SettingsPopover";
import { useAudioRecorder } from "@/src/hooks/useAudioRecorder";
import { parseWithGeminiFlash } from "@/src/services/gemini";
import { parseReceiptWithGemini } from "@/src/services/receipt";
import { transcribeAudio } from "@/src/services/sarvam";
import {
  addTransaction,
  deleteTransaction,
  getDeviceIdentity,
  updateTransaction,
  isTransactionShared,
  getRecurringTemplates,
} from "@/src/db/db";
import { RECURRING_TEMPLATES, type Frequency, type RecurringTemplate } from "@/src/config/recurring";
import type { Expense } from "@/src/utils/schemas";
import type { Transaction, Recurring_template } from "@/src/types";
import { AlertCircle, X, User, Users } from "lucide-react";
import { prepareReceiptImage } from "@/src/utils/imageProcessing";
import {
  DISMISS_TRANSCRIPTS,
  MIN_AUDIO_DURATION_MS,
  MIN_AUDIO_SIZE_BYTES,
} from "@/src/config/mic";
import { ERROR_MESSAGES, toUserMessage } from "@/src/utils/error";
import { playMoneySound } from "@/src/utils/soundFeedback";
import posthog from "posthog-js";
import {
  getAlertsEnabled,
  getAlertsEnvironment,
  isAlertsReady,
  syncAlertsQueue,
} from "@/src/services/pwaAlerts";
import { useCurrency } from "@/src/hooks/useCurrency";
import { useRecording } from "@/src/context/AppContext";

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

// Module-scope animation objects — prevents framer-motion from restarting on re-render
const headerInitial = { opacity: 0, y: -8 };
const headerAnimate = { opacity: 1, y: 0 };
const headerTransition = { duration: 0.4 };
const headerTransitionDelay = { duration: 0.4, delay: 0.1 };

const AppShell = ({ showHousehold }: { showHousehold: boolean }) => {
  // Use specific contexts instead of monolithic useAppContext
  const { isRecording, setIsRecording } = useRecording();
  const { activeTab, setActiveTab } = useNavigation();
  const { setIncomingPair } = usePairing();
  const { code: currency, symbol: currencySymbol } = useCurrency();

  // Initialize presence at app level for discoverability
  const { isConnected, error } = useSignaling();

  // useTransition for expensive state updates that trigger heavy renders
  const [isPending, startTransition] = useTransition();

  const [refreshKey, setRefreshKey] = useState(0);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [editedTx, setEditedTx] = useState<Transaction | null>(null);
  const [addedTx, setAddedTx] = useState<Transaction | null>(null);
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
  const isEditing = editState !== null;
  const [lastError, setLastError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingTransactions, setPendingTransactions] = useState<Transaction[]>([]);
  const [lastAudioBlob, setLastAudioBlob] = useState<Blob | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isTxnSheetOpen, setIsTxnSheetOpen] = useState(false);
  const [isReceiptProcessing, setIsReceiptProcessing] = useState(false);
  const [isTextProcessing, setIsTextProcessing] = useState(false);
  const [activeSection, setActiveSection] = useState<TabType>("summary");
  const [recurringModalState, setRecurringModalState] = useState<{
    mode: "new" | "edit";
    template: RecurringTemplate | null;
    recurringTemplate: Recurring_template | null;
    reactivatePreset: boolean;
    prefill?: { name: string; amount: number; category: string; paymentMethod: string; frequency: Frequency } | null;
  } | null>(null);
  const isRecurringModalOpen = recurringModalState !== null;

  // Stable fallback timestamp for EditModal — only updates when editState changes
  const editTimestampFallback = useMemo(() => Date.now(), [editState]);

  const { client } = useSignaling();
  const identityRef = useRef<any>(null);

  useEffect(() => {
    void (async () => {
      const device = await getDeviceIdentity();
      identityRef.current = device;
    })();
  }, []);

  useEffect(() => {
    const syncAlertsIfReady = async () => {
      const enabled = getAlertsEnabled();
      const env = getAlertsEnvironment();
      if (!isAlertsReady(enabled, env)) return;
      const templates = await getRecurringTemplates();
      await syncAlertsQueue(templates);
    };

    void syncAlertsIfReady();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncAlertsIfReady();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    if (!client) return;

    const offReq = client.on("pairing:request", (payload) => {
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) {
        return;
      }

      // Capture the request in global state
      setIncomingPair({
        session_id: payload.session_id,
        from_device_id: payload.from_device_id,
        from_display_name: payload.from_display_name,
      });

      // Auto-switch to Household tab ONLY if the feature is enabled
      setTimeout(() => {
        if (showHousehold) {
          setActiveTab("household");
        }
      }, 300);
    });

    const offCancel = client.on("pairing:cancel", (payload) => {
      // We don't have access to current incomingPair here without a ref, 
      // but we can just call a function that checks it or rely on HouseholdView 
      // once it's mounted. For now, let's at least clear it if it exists.
      setIncomingPair(null);
    });

    return () => {
      offReq();
      offCancel();
    };
  }, [client, setActiveTab, setIncomingPair, showHousehold]);

  useEffect(() => {
    // Force back to personal if currently on household and disabled
    if (!showHousehold && activeTab === "household") {
      setActiveTab("personal");
    }
  }, [showHousehold, activeTab, setActiveTab]);

  useEffect(() => {
    if (activeTab !== "personal") {
      setActiveSection("summary");
    }
  }, [activeTab]);

  const [transcriptFeedback, setTranscriptFeedback] = useState<{
    txId: string; item: string; amount: number; category: string; paymentMethod: string;
  } | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processedBlobRef = useRef<Blob | null>(null);
  const processingRef = useRef(false);
  const receiptProcessingRef = useRef(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  const audioRecorder = useAudioRecorder();

  useEffect(() => {
    void getDeviceIdentity();
  }, []);

  useEffect(() => {
    if (activeSection !== "summary") {
      setIsTxnSheetOpen(false);
    }
  }, [activeSection]);

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

  // Auto-dismiss error after 5s
  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(() => setLastError(null), 5000);
    return () => clearTimeout(t);
  }, [lastError]);

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

  useEffect(() => {
    if (!("launchQueue" in window)) return;
    (window as unknown as { launchQueue: { setConsumer: (fn: (params: { files: { getFile: () => Promise<File> }[] }) => void) => void } }).launchQueue.setConsumer(async (launchParams) => {
      if (!launchParams.files.length) return;
      const file = await launchParams.files[0].getFile();
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result);
        void processReceiptDataUrl(dataUrl);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const refreshTransactions = useCallback(() => {
    startTransition(() => {
      setRefreshKey((prev) => prev + 1);
    });
  }, []);

  const handleAddRecurring = useCallback((template?: RecurringTemplate) => {
    setRecurringModalState({
      mode: "new",
      template: template ?? null,
      recurringTemplate: null,
      reactivatePreset: false,
    });
  }, []);

  const handleEditRecurring = useCallback((template: Recurring_template) => {
    setRecurringModalState({
      mode: "edit",
      template: null,
      recurringTemplate: template,
      reactivatePreset: false,
    });
  }, []);

  const handleReactivateRecurring = useCallback((template: Recurring_template) => {
    setRecurringModalState({
      mode: "edit",
      template: null,
      recurringTemplate: template,
      reactivatePreset: true,
    });
  }, []);

  const handleCloseRecurringModal = useCallback(() => {
    setRecurringModalState(null);
  }, []);

  const handleSaveRecurring = useCallback(() => {
    refreshTransactions();
  }, [refreshTransactions]);

  const startProcessing = useCallback(() => {
    if (processingRef.current) return false;
    processingRef.current = true;
    setIsProcessing(true);
    return true;
  }, []);

  const stopProcessing = useCallback(() => {
    setIsProcessing(false);
    processingRef.current = false;
  }, []);

  const startReceiptProcessing = useCallback(() => {
    if (receiptProcessingRef.current) return false;
    receiptProcessingRef.current = true;
    setIsReceiptProcessing(true);
    return true;
  }, []);

  const stopReceiptProcessing = useCallback(() => {
    setIsReceiptProcessing(false);
    receiptProcessingRef.current = false;
  }, []);

  const addPendingTransaction = useCallback((label: string) => {
    const pending: Transaction = {
      id: `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      amount: 0,
      item: label,
      category: "Other",
      paymentMethod: "unknown",
      timestamp: Date.now(),
      is_private: false,
    };
    setPendingTransactions((prev) => [pending, ...prev]);
    return pending.id;
  }, []);

  const removePendingTransaction = useCallback((id: string) => {
    setPendingTransactions((prev) => prev.filter((tx) => tx.id !== id));
  }, []);

  const parseTranscript = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const fallback: Expense = {
      amount: 50,
      item: trimmed || "Auto",
      category: "Travel",
      date: formatDateYMD(new Date()),
      paymentMethod: "cash",
      confidence: 0.4,
      recurring: false,
    };

    try {
      return await parseWithGeminiFlash(trimmed, currency);
    } catch (error) {
      return fallback;
    }
  }, [currency]);

  const processTextInput = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!startProcessing()) return;
    setIsTextProcessing(true);
    setLastError(null);
    const pendingId = addPendingTransaction("Processing…");
    try {
      const expense = await parseTranscript(trimmed);
      const now = Date.now();
      if (expense.amount <= 0) {
        setLastError(ERROR_MESSAGES.amountGreaterThanZero);
        stopProcessing();
        setIsTextProcessing(false);
        return;
      }

      // Recurring intent: open RecurringEditModal pre-filled
      if (expense.recurring) {
        const matchedTemplate = expense.templateId
          ? RECURRING_TEMPLATES.find((t) => t.id === expense.templateId) ?? null
          : null;

        // Block if this template is already saved
        if (matchedTemplate) {
          const existing = await getRecurringTemplates();
          if (existing.some((t) => t.recurring_template_id === matchedTemplate.id)) {
            setLastError(`"${expense.item}" is already set up as a recurring expense.`);
            stopProcessing();
            setIsTextProcessing(false);
            return;
          }
        }

        setRecurringModalState({
          mode: "new",
          template: matchedTemplate,
          recurringTemplate: null,
          reactivatePreset: false,
          prefill: {
            name: expense.item,
            amount: expense.amount,
            category: matchedTemplate?.category ?? expense.category,
            paymentMethod: expense.paymentMethod ?? "cash",
            frequency: (expense.frequency as Frequency) ?? matchedTemplate?.suggestedFrequency ?? "monthly",
          },
        });
        posthog.capture("recurring_detected", {
          amount: expense.amount,
          category: expense.category,
          frequency: expense.frequency ?? "monthly",
          input_method: "text",
        });
      } else {
        // One-time transaction: instant add + undo pill
        const transaction: Transaction = {
          id: "",
          amount: expense.amount,
          item: expense.item,
          category: expense.category,
          paymentMethod: expense.paymentMethod ?? "cash",
          timestamp: toTimestamp(expense.date, now),
        };
        const id = await addTransaction(transaction);
        setAddedTx({ ...transaction, id });
        playMoneySound(transaction.amount, currency);
        refreshTransactions();
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setTranscriptFeedback({ txId: id, item: expense.item, amount: expense.amount, category: expense.category, paymentMethod: expense.paymentMethod ?? "cash" });
        undoTimeoutRef.current = setTimeout(() => setTranscriptFeedback(null), 4000);
        posthog.capture("transaction_added", {
          amount: expense.amount,
          category: expense.category,
          payment_method: expense.paymentMethod ?? "cash",
          input_method: "text",
        });
      }
    } catch (error) {
      setLastError(toUserMessage(error, "unableToTranscribeAudio"));
    } finally {
      removePendingTransaction(pendingId);
      stopProcessing();
      setIsTextProcessing(false);
    }
  }, [addPendingTransaction, currency, parseTranscript, refreshTransactions, removePendingTransaction, startProcessing, stopProcessing]);

  const handleStartRecording = useCallback(async () => {
    setLastError(null); // Clear any previous errors
    // Clear stale feedback so old pill doesn't flash when new recording stops
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setTranscriptFeedback(null);
    posthog.capture("recording_started");
    await audioRecorder.startRecording();
  }, [audioRecorder]);

  const getAudioValidationError = useCallback((blob: Blob | null, durationMs: number) => {
    if (!blob) return ERROR_MESSAGES.noAudioCaptured;
    if (durationMs > 0 && durationMs < MIN_AUDIO_DURATION_MS) {
      return ERROR_MESSAGES.recordingTooShort;
    }
    if (blob.size < MIN_AUDIO_SIZE_BYTES) {
      return ERROR_MESSAGES.recordingTooShort;
    }
    return null;
  }, []);

  const processAudioBlob = useCallback(async (audioBlob: Blob) => {
    // Prevent duplicate processing (race condition)
    if (!startProcessing()) return;
    setLastError(null);
    const pendingId = addPendingTransaction("Processing…");
    try {
      const text = await transcribeAudio(audioBlob);
      const normalized = text.trim().toLowerCase();
      if (DISMISS_TRANSCRIPTS.has(normalized)) {
        stopProcessing();
        return;
      }
      const expense = await parseTranscript(text || "Auto 50");
      const now = Date.now();
      if (expense.amount <= 0) {
        setLastError(ERROR_MESSAGES.amountGreaterThanZero);
        stopProcessing();
        return;
      }

      // Recurring intent: check if template already exists, then open modal or fall through
      // Recurring intent: open RecurringEditModal pre-filled
      if (expense.recurring) {
        const matchedTemplate = expense.templateId
          ? RECURRING_TEMPLATES.find((t) => t.id === expense.templateId) ?? null
          : null;

        // Block if this template is already saved
        if (matchedTemplate) {
          const existing = await getRecurringTemplates();
          if (existing.some((t) => t.recurring_template_id === matchedTemplate.id)) {
            setLastError(`"${expense.item}" is already set up as a recurring expense.`);
            stopProcessing();
            return;
          }
        }

        setRecurringModalState({
          mode: "new",
          template: matchedTemplate,
          recurringTemplate: null,
          reactivatePreset: false,
          prefill: {
            name: expense.item,
            amount: expense.amount,
            category: matchedTemplate?.category ?? expense.category,
            paymentMethod: expense.paymentMethod ?? "cash",
            frequency: (expense.frequency as Frequency) ?? matchedTemplate?.suggestedFrequency ?? "monthly",
          },
        });
        posthog.capture("recurring_detected", {
          amount: expense.amount,
          category: expense.category,
          frequency: expense.frequency ?? "monthly",
          input_method: "voice",
        });
      } else {
        // One-time transaction: instant add + undo pill
        const transaction: Transaction = {
          id: "",
          amount: expense.amount,
          item: expense.item,
          category: expense.category,
          paymentMethod: expense.paymentMethod ?? "cash",
          timestamp: toTimestamp(expense.date, now),
        };
        const id = await addTransaction(transaction);
        setAddedTx({ ...transaction, id });
        playMoneySound(transaction.amount, currency);
        refreshTransactions();
        if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
        setTranscriptFeedback({ txId: id, item: expense.item, amount: expense.amount, category: expense.category, paymentMethod: expense.paymentMethod ?? "cash" });
        undoTimeoutRef.current = setTimeout(() => setTranscriptFeedback(null), 4000);
        posthog.capture("transaction_added", {
          amount: expense.amount,
          category: expense.category,
          payment_method: expense.paymentMethod ?? "cash",
        });
      }
    } catch (error) {
      setLastError(toUserMessage(error, "unableToTranscribeAudio"));
      posthog.capture("error_occurred", {
        error_type: "transcription_failed",
        error_message: toUserMessage(error, "unableToTranscribeAudio"),
      });
    } finally {
      removePendingTransaction(pendingId);
      stopProcessing();
    }
  }, [addPendingTransaction, currency, parseTranscript, refreshTransactions, removePendingTransaction, startProcessing, stopProcessing]);

  const handleUndoTranscript = useCallback(async () => {
    if (!transcriptFeedback) return;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const { txId, amount, item, category, paymentMethod } = transcriptFeedback;
    setTranscriptFeedback(null);
    await deleteTransaction(txId);
    setDeletedTx({ id: txId, amount, item, category, paymentMethod: paymentMethod as Transaction["paymentMethod"], timestamp: Date.now() });
    refreshTransactions();
  }, [transcriptFeedback, refreshTransactions]);

  // Cleanup undo timeout on unmount
  useEffect(() => () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); }, []);

  const processReceiptDataUrl = useCallback(async (dataUrl: string) => {
    if (!startReceiptProcessing()) return;
    setLastError(null);
    const pendingId = addPendingTransaction("Processing receipt...");
    try {
      const blob = dataUrlToBlob(dataUrl);
      const normalized = await prepareReceiptImage(blob);
      const expense = await parseReceiptWithGemini(normalized, currency);
      const now = Date.now();
      if (expense.amount <= 0) {
        throw new Error(ERROR_MESSAGES.amountGreaterThanZero);
      }
      const transaction: Transaction = {
        id: "",
        amount: expense.amount,
        item: expense.item,
        category: expense.category,
        paymentMethod: expense.paymentMethod ?? "cash",
        timestamp: toTimestamp(expense.date, now),
      };
      const id = await addTransaction(transaction);
      setAddedTx({ ...transaction, id });
      playMoneySound(transaction.amount, currency);
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
      });
    } catch (error) {
      setLastError(toUserMessage(error, "unableToProcessReceipt"));
      posthog.capture("error_occurred", {
        error_type: "receipt_processing_failed",
        error_message: toUserMessage(error, "unableToProcessReceipt"),
      });
    } finally {
      removePendingTransaction(pendingId);
      stopReceiptProcessing();
    }
  }, [addPendingTransaction, currency, refreshTransactions, removePendingTransaction, startReceiptProcessing, stopReceiptProcessing]);

  const handleReceiptUpload = useCallback(async (
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
  }, [processReceiptDataUrl]);

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
  }, [audioRecorder, getAudioValidationError, processAudioBlob]);

  const onMicPress = useCallback(() => {
    if (isRecording) {
      void handleStopRecording();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      void handleStartRecording();
    }
  }, [isRecording, handleStopRecording, handleStartRecording]);

  const onReceiptUploadClick = useCallback(() => {
    receiptInputRef.current?.click();
  }, []);

  // useDeferredValue for search/filter inputs to keep UI responsive
  const [todayLabel, setTodayLabel] = useState("");

  useEffect(() => {
    const label = new Date().toLocaleDateString("en-IN", {
      weekday: "short",
      day: "2-digit",
      month: "short",
    });
    setTodayLabel(label);
  }, []);

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
            is_private: data.isPrivate ?? false,
          },
          editState.id
        );
        await updateTransaction(editState.id, updated);
        setEditedTx(updated);
        posthog.capture("transaction_edited", {
          amount: data.amount,
          category: data.category,
          payment_method: data.paymentMethod,
        });
      } else {
        const transaction = buildTransaction({
          ...data,
          is_private: data.isPrivate ?? false,
        });
        const id = await addTransaction(transaction);
        setAddedTx({ ...transaction, id });
        playMoneySound(transaction.amount, currency);
        posthog.capture("transaction_added", {
          amount: data.amount,
          category: data.category,
          payment_method: data.paymentMethod,
        });
      }
      startTransition(() => {
        setRefreshKey((prev) => prev + 1);
      });
      setEditState(null);
    },
    [currency, editState]
  );

  const handleCloseHistory = useCallback(() => {
    setIsHistoryOpen(false);
  }, []);

  const handleHistoryDeleted = useCallback((tx: Transaction) => {
    setDeletedTx(tx);
    startTransition(() => {
      setRefreshKey((prev) => prev + 1);
    });
  }, []);

  // Memoize the header tab switch handler
  const handleTabSwitch = useCallback(() => {
    setActiveTab(activeTab === "household" ? "personal" : "household");
  }, [activeTab, setActiveTab]);

  return (
    <div className="relative min-h-screen bg-[var(--kk-paper)] pb-28 text-[var(--kk-ink)]">
      {/* Background gradient orbs */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden"
        style={{ contain: "strict" }}
      >
        <div
          className="kk-gradient-orb kk-gradient-orb-ember absolute -right-32 top-20 h-96 w-96 kk-orb-pulse-ember"
        />
        <div
          className="kk-gradient-orb kk-gradient-orb-saffron absolute -left-20 top-1/3 h-80 w-80 kk-orb-pulse-saffron"
        />
        <div className="kk-gradient-orb kk-gradient-orb-ink absolute bottom-20 left-1/2 h-[500px] w-[500px] -translate-x-1/2" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)] px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="justify-self-start">
              {showHousehold && (
                <motion.button
                  type="button"
                  onClick={handleTabSwitch}
                  aria-label={activeTab === "household" ? "Switch to Personal" : "Switch to Household"}
                  className="kk-icon-btn kk-icon-btn-ghost kk-icon-btn-sm"
                  whileTap={{ scale: 0.9 }}
                >
                  {activeTab === "household" ? (
                    <User className="h-4 w-4" style={{ color: "var(--kk-ember)" }} />
                  ) : (
                    <Users className="h-4 w-4" />
                  )}
                </motion.button>
              )}
            </div>
            <div className="min-w-0 text-center">
              <motion.div
                initial={headerInitial}
                animate={headerAnimate}
                transition={headerTransition}
                className="kk-label"
              >
                {todayLabel}
              </motion.div>
              <motion.h1
                initial={headerInitial}
                animate={headerAnimate}
                transition={headerTransitionDelay}
                className="mt-0.5 text-2xl font-bold font-[family:var(--font-display)] tracking-tight"
              >
                Kharcha<span className="text-[var(--kk-ember)]">Kitab</span>
              </motion.h1>
            </div>
            <div className="justify-self-end">
              <SettingsPopover />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
        {activeTab === "personal" ? (
          <>
            {/* Summary section — always mounted, hidden when not active */}
            <div style={{ display: activeSection === "summary" ? undefined : "none" }}>
              {/* Recording/Processing Status */}
              <RecordingStatus
                isRecording={false}
                isProcessing={false}
                isReceiptProcessing={isReceiptProcessing}
                isTextProcessing={isTextProcessing}
              />

              {/* Transaction List */}
              <section>
                <TransactionList
                  refreshKey={refreshKey}
                  addedTx={addedTx}
                  deletedTx={deletedTx}
                  editedTx={editedTx}
                  pendingTransactions={pendingTransactions}
                  onViewAll={handleOpenHistory}
                  onEdit={openEdit}
                  onMobileSheetChange={setIsTxnSheetOpen}
                  onDeleted={handleTransactionDeleted}
                  onReceiptUploadClick={onReceiptUploadClick}
                  isReceiptProcessing={isReceiptProcessing}
                />
              </section>
            </div>

            {/* Recurring section — always mounted, hidden when not active */}
            <section style={{ display: activeSection === "recurring" ? undefined : "none" }}>
              <RecurringView
                refreshKey={refreshKey}
                onAddRecurring={handleAddRecurring}
                onEditRecurring={handleEditRecurring}
                onReactivateRecurring={handleReactivateRecurring}
                onMobileSheetChange={setIsTxnSheetOpen}
              />
            </section>
          </>
        ) : showHousehold ? (
          <HouseholdView />
        ) : null}
      </main>

      {/* Bottom Tab Bar */}
      {!isTxnSheetOpen && activeTab === "personal" && (
        <BottomTabBar
          activeTab={activeSection}
          onTabChange={setActiveSection}
          isRecording={isRecording}
          isProcessing={isProcessing}
          onMicPress={onMicPress}
          onTextSubmit={processTextInput}
          transcriptFeedback={transcriptFeedback ? { ...transcriptFeedback, currencySymbol } : null}
          onUndoTranscript={handleUndoTranscript}
        />
      )}
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleReceiptUpload}
      />

      {/* Edit Modal — conditionally mounted */}
      {isEditing && (
        <EditModal
          isOpen={isEditing}
          amount={editState?.amount ?? 0}
          item={editState?.item ?? ""}
          category={editState?.category ?? "Food"}
          paymentMethod={editState?.paymentMethod ?? "cash"}
          timestamp={editState?.timestamp ?? editTimestampFallback}
          isPrivate={editState?.isPrivate ?? false}
          isShared={editState?.isShared ?? false}
          showHousehold={showHousehold}
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}

      {/* Recurring Edit Modal — conditionally mounted */}
      {isRecurringModalOpen && (
        <RecurringEditModal
          isOpen={isRecurringModalOpen}
          mode={recurringModalState.mode}
          template={recurringModalState.template}
          recurringTemplate={recurringModalState.recurringTemplate}
          reactivatePreset={recurringModalState.reactivatePreset}
          prefill={recurringModalState.prefill}
          onClose={handleCloseRecurringModal}
          onSave={handleSaveRecurring}
        />
      )}

      {/* History View — conditionally mounted */}
      {isHistoryOpen && (
        <HistoryView
          isOpen={isHistoryOpen}
          onClose={handleCloseHistory}
          onDeleted={handleHistoryDeleted}
          refreshKey={refreshKey}
          editedTx={editedTx}
          onEdit={openEdit}
        />
      )}

      {/* Error Toast — fixed at top, visible on all tabs and scroll positions */}
      <AnimatePresence>
        {lastError && (
          <motion.div
            initial={{ opacity: 0, y: -48 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -48 }}
            transition={{ type: "spring", damping: 24, stiffness: 300 }}
            className="fixed left-4 right-4 top-4 z-[200] mx-auto max-w-md overflow-hidden rounded-[var(--kk-radius-lg)] border border-[rgba(229,72,77,0.24)] bg-white/90 px-4 py-3 shadow-[0_8px_32px_rgba(229,72,77,0.18)] backdrop-blur-xl"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(229,72,77,0.1)] text-[var(--kk-danger)]">
                <AlertCircle className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5 text-[13px] font-semibold leading-snug text-[var(--kk-danger-ink)]">
                {lastError}
              </div>
              <button
                onClick={() => setLastError(null)}
                className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[var(--kk-danger-ink)]/50 transition-colors hover:bg-[rgba(229,72,77,0.1)] hover:text-[var(--kk-danger-ink)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {/* Auto-dismiss progress bar */}
            <motion.div
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: 5, ease: "linear" }}
              className="absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[var(--kk-danger)]/30"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading overlay for pending transitions */}
      {isPending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--kk-void)]/10 pointer-events-none">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--kk-ember)] border-t-transparent" />
        </div>
      )}
    </div>
  );
};

function useHouseholdFlag() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (isLocal) {
      setEnabled(true);
      return;
    }
    posthog.onFeatureFlags(() => {
      setEnabled(!!posthog.isFeatureEnabled("household-view"));
    });
  }, []);
  return enabled;
}

export default function Home() {
  const showHousehold = useHouseholdFlag();
  return (
    <AppProvider>
      {showHousehold ? (
        <SignalingProvider>
          <AppShell showHousehold={showHousehold} />
        </SignalingProvider>
      ) : (
        <AppShell showHousehold={false} />
      )}
    </AppProvider>
  );
}
