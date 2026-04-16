
"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { AppProvider } from "@/src/context/AppContext";
import { useNavigation, usePairing } from "@/src/context/AppContext";
import { SignalingProvider, useSignaling } from "@/src/context/SignalingContext";
import type { TabType } from "@/src/components/BottomTabBar";

const BottomTabBar = dynamic(() => import("@/src/components/BottomTabBar").then(m => ({ default: m.BottomTabBar })), { ssr: false });
// const StreakBadge = dynamic(() => import("@/src/components/StreakBadge").then(m => ({ default: m.StreakBadge })), { ssr: false });

const HomeView = dynamic(() => import("@/src/components/HomeView").then(m => ({ default: m.HomeView })), { ssr: false });
const RecordingStatus = dynamic(() => import("@/src/components/RecordingStatus").then(m => ({ default: m.RecordingStatus })), { ssr: false });
const AgentChat = dynamic(() => import("@/src/components/AgentChat").then(m => ({ default: m.AgentChat })), { ssr: false });
const EditModal = dynamic(() => import("@/src/components/EditModal").then(m => ({ default: m.EditModal })), { ssr: false });
const AnalyticsView = dynamic(() => import("@/src/components/AnalyticsView").then(m => ({ default: m.AnalyticsView })), { ssr: false });
const RecurringView = dynamic(() => import("@/src/components/RecurringView").then(m => ({ default: m.RecurringView })), { ssr: false });
const RecurringEditModal = dynamic(() => import("@/src/components/RecurringEditModal").then(m => ({ default: m.RecurringEditModal })), { ssr: false });
const NotificationsSettings = dynamic(() => import("@/src/components/NotificationsSettings").then(m => ({ default: m.NotificationsSettings })), { ssr: false });
const BulkExpensePreview = dynamic(() => import("@/src/components/BulkExpensePreview").then(m => ({ default: m.BulkExpensePreview })), { ssr: false });
const SyncOverlay = dynamic(() => import("@/src/components/SyncOverlay").then(m => ({ default: m.SyncOverlay })), { ssr: false });
const ProfileView = dynamic(() => import("@/src/components/ProfileView").then(m => ({ default: m.ProfileView })), { ssr: false });
import { useStreamingSTT } from "@/src/hooks/useStreamingSTT";
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
import { AlertCircle, X, Download, Sparkles, ChevronLeft } from "lucide-react";
import { prepareReceiptImage } from "@/src/utils/imageProcessing";

import { ERROR_MESSAGES, toUserMessage } from "@/src/utils/error";
import { playMoneySound } from "@/src/utils/soundFeedback";
import { capture as posthogCapture } from "@/src/utils/analytics";
// Notifications services loaded dynamically in useEffects
import { useCurrency } from "@/src/hooks/useCurrency";
import { usePwaInstall } from "@/src/hooks/usePwaInstall";
import { useOnboardingTour } from "@/src/hooks/useOnboardingTour";
import { useBackButton } from "@/src/hooks/useBackButton";
// import { useStreak } from "@/src/hooks/useStreak";
import { useRecording } from "@/src/context/AppContext";
import { TRANSACTION_PENDING_LABEL } from "@/src/utils/transactions";
import { usePendingTransactions } from "@/src/hooks/usePendingTransactions";
import { useVercelMigration } from "@/src/hooks/useVercelMigration";

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
  // Use specific contexts instead of monolithic useAppContext
  const { isRecording, setIsRecording } = useRecording();
  const { activeTab, setActiveTab } = useNavigation();
  const { incomingPair } = usePairing();
  const { code: currency, symbol: currencySymbol } = useCurrency();
  const { canPrompt: canInstall, promptInstall, dismiss: dismissInstall } = usePwaInstall();
  const { showTooltip, showTooltipsInOrder } = useOnboardingTour();
  // const { count: streakCount, broke: streakBroke, lostCount: streakLostCount, recordActivity: recordStreak } = useStreak();

  // One-time migration from vercel.app to custom domain
  useVercelMigration();

  // Initialize presence at app level for discoverability
  useSignaling();

  // useTransition for expensive state updates that trigger heavy renders
  const [isPending, startTransition] = useTransition();

  const [refreshKey, setRefreshKey] = useState(0);
  const [deletedTx, setDeletedTx] = useState<Transaction | null>(null);
  const [editedTx, setEditedTx] = useState<Transaction | null>(null);
  const [addedTx, setAddedTx] = useState<Transaction | null>(null);
  const [editState, setEditState] = useState<{
    id: string;
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
  const { pendingTransactions, addPending: addPendingTransaction, removePending: removePendingTransaction } = usePendingTransactions();
const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSyncOpen, setIsSyncOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isTxnSheetOpen, setIsTxnSheetOpen] = useState(false);
  const [isReceiptProcessing, setIsReceiptProcessing] = useState(false);
  const [isTextProcessing, setIsTextProcessing] = useState(false);
  const [isListEmpty, setIsListEmpty] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
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
    let cancelled = false;
    const syncAlertsIfReady = async () => {
      const { getAlertsEnabled, getAlertsEnvironment, isAlertsReady, syncAlertsQueue } = await import("@/src/services/notifications");
      if (cancelled) return;
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
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  useEffect(() => {
    void (async () => {
      const { scheduleDailyReminder, scheduleMannKiBaat } = await import("@/src/services/notifications");
      scheduleDailyReminder();
      scheduleMannKiBaat();
    })();
  }, []);

  useEffect(() => {
    if (!client) {
      console.log("[Pairing] No signaling client available in AppShell yet");
      return;
    }

    console.log("[Pairing] Signaling client available in AppShell (Global listeners handled by SignalingProvider)");
  }, [client]);


  const [transcriptFeedback, setTranscriptFeedback] = useState<{
    txId: string; item: string; amount: number; category: string; paymentMethod: string;
  } | null>(null);
  const [bulkExpenses, setBulkExpenses] = useState<Expense[] | null>(null);
  const recurringQueueRef = useRef<Expense[]>([]);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processingRef = useRef(false);
  const receiptProcessingRef = useRef(false);
  const receiptInputRef = useRef<HTMLInputElement | null>(null);

  // ── Streaming STT hook (declared early; callback wired via ref to avoid ordering issues) ──
  const endOfSpeechHandlerRef = useRef<(transcript: string) => void>(() => { });
  const streamingSTT = useStreamingSTT({
    onEndOfSpeech: useCallback((transcript: string) => {
      endOfSpeechHandlerRef.current(transcript);
    }, []),
  });

  useEffect(() => {
    void getDeviceIdentity();
  }, []);

  useEffect(() => {
    if (activeTab !== "summary") {
      setIsTxnSheetOpen(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setIsRecording(streamingSTT.isStreaming);
    if (streamingSTT.isStreaming) {
      setLastError(null);
    }
  }, [streamingSTT.isStreaming, setIsRecording]);

  useEffect(() => {
    if (streamingSTT.error) {
      setLastError(streamingSTT.error);
    }
  }, [streamingSTT.error]);

  // Show PWA install banner after first successful transaction (C1)
  useEffect(() => {
    if (addedTx && canInstall) {
      const t = setTimeout(() => setShowInstallBanner(true), 2000);
      return () => clearTimeout(t);
    }
  }, [addedTx, canInstall]);

  useEffect(() => {
    if (activeTab === "recurring") {
      showTooltip("recurring-presets", 800);
    }
  }, [activeTab, showTooltip]);

  // First-visit tooltips shown in explicit priority order, sequenced by user dismissal
  useEffect(() => {
    showTooltipsInOrder(["notifications-toggle"], 10000);
  }, [showTooltipsInOrder]);

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

  const openRecurringFromExpense = useCallback((expense: Expense) => {
    const matchedTemplate = expense.templateId
      ? RECURRING_TEMPLATES.find((t) => t.id === expense.templateId) ?? null
      : null;
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
  }, []);

  const handleCloseRecurringModal = useCallback(() => {
    setRecurringModalState(null);
    const next = recurringQueueRef.current.shift();
    if (next) openRecurringFromExpense(next);
  }, [openRecurringFromExpense]);

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

  const parseTranscript = useCallback(async (text: string) => {
    const trimmed = text.trim();
    const { parseWithGeminiFlash } = await import("@/src/services/gemini");
    return await parseWithGeminiFlash(trimmed, currency);
  }, [currency]);

  const saveSingleExpense = useCallback(async (expense: Expense, inputMethod: string) => {
    const now = Date.now();
    if (expense.amount <= 0) {
      setLastError(ERROR_MESSAGES.amountGreaterThanZero);
      return;
    }

    // Recurring intent: open RecurringEditModal pre-filled
    if (expense.recurring) {
      const matchedTemplate = expense.templateId
        ? RECURRING_TEMPLATES.find((t) => t.id === expense.templateId) ?? null
        : null;

      if (matchedTemplate) {
        const existing = await getRecurringTemplates();
        if (existing.some((t) => t.recurring_template_id === matchedTemplate.id)) {
          setLastError(`"${expense.item}" is already set up as a recurring expense.`);
          return;
        }
      }

      openRecurringFromExpense(expense);
      posthogCapture("recurring_detected", {
        amount: expense.amount,
        category: expense.category,
        frequency: expense.frequency ?? "monthly",
        input_method: inputMethod,
      });
    } else {
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
      // recordStreak();
      refreshTransactions();
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      setTranscriptFeedback({ txId: id, item: expense.item, amount: expense.amount, category: expense.category, paymentMethod: expense.paymentMethod ?? "cash" });
      undoTimeoutRef.current = setTimeout(() => setTranscriptFeedback(null), 4000);
      posthogCapture("transaction_added", {
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.paymentMethod ?? "cash",
        input_method: inputMethod,
      });
    }
  }, [addTransaction, currency, getRecurringTemplates, openRecurringFromExpense, refreshTransactions]);

  const handleBulkSave = useCallback(async (expenses: Expense[]) => {
    setBulkExpenses(null);
    const nonRecurring = expenses.filter((e) => !e.recurring);
    const recurring = expenses.filter((e) => e.recurring);
    const now = Date.now();

    for (const expense of nonRecurring) {
      const transaction: Transaction = {
        id: "",
        amount: expense.amount,
        item: expense.item,
        category: expense.category,
        paymentMethod: expense.paymentMethod ?? "cash",
        timestamp: toTimestamp(expense.date, now),
      };
      await addTransaction(transaction);
      // recordStreak();
    }

    if (nonRecurring.length > 0) {
      playMoneySound(nonRecurring[0].amount, currency);
      refreshTransactions();
      posthogCapture("bulk_transactions_added", {
        count: nonRecurring.length,
        input_method: "text",
      });
    }

    if (recurring.length > 0) {
      const [first, ...rest] = recurring;
      recurringQueueRef.current = rest;
      openRecurringFromExpense(first);
      if (nonRecurring.length === 0) playMoneySound(first.amount, currency);
    }
  }, [addTransaction, currency, openRecurringFromExpense, refreshTransactions]);

  const processTextInput = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!startProcessing()) return;
    setIsTextProcessing(true);
    setLastError(null);
    const pendingId = addPendingTransaction(TRANSACTION_PENDING_LABEL);
    try {
      const expenses = await parseTranscript(trimmed);

      if (expenses.length > 1) {
        // Multi-expense: show preview sheet
        setBulkExpenses(expenses);
      } else {
        // Single expense: existing auto-save flow
        const expense = expenses[0];
        if (expense) await saveSingleExpense(expense, "text");
      }
    } catch (error) {
      setLastError(toUserMessage(error, "unableToTranscribeAudio"));
      posthogCapture("error_occurred", {
        error_type: "text_parse_failed",
        error_message: toUserMessage(error, "unableToTranscribeAudio"),
      });
    } finally {
      removePendingTransaction(pendingId);
      stopProcessing();
      setIsTextProcessing(false);
    }
  }, [addPendingTransaction, currency, parseTranscript, refreshTransactions, removePendingTransaction, startProcessing, stopProcessing]);

  const handleStartRecording = useCallback(async () => {
    setLastError(null);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    setTranscriptFeedback(null);
    // Reset dedup ref so same transcript can be processed in a new session
    lastProcessedTranscriptRef.current = "";
    await streamingSTT.start();
    posthogCapture("recording_started", { streaming: true });
  }, [streamingSTT]);

  // ── Streaming STT (replaces batch transcribeAudio for voice input) ──
  const lastProcessedTranscriptRef = useRef("");
  const processStreamingTranscript = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    console.log("[StreamingSTT] END_SPEECH detected, transcript:", trimmed);
    // Prevent double-processing (END_SPEECH + manual stop can both fire)
    if (trimmed === lastProcessedTranscriptRef.current) return;
    lastProcessedTranscriptRef.current = trimmed;
    const normalized = trimmed.toLowerCase();
    if (new Set(["no, i don't want it.", "okay.", "yes.", "okay, i will do it.", ""]).has(normalized)) return;
    if (!startProcessing()) return;
    setLastError(null);
    const pendingId = addPendingTransaction(TRANSACTION_PENDING_LABEL);
    try {
      const expenses = await parseTranscript(trimmed);
      if (expenses.length > 1) {
        setBulkExpenses(expenses);
      } else {
        const expense = expenses[0];
        if (expense) await saveSingleExpense(expense, "voice");
      }
    } catch (error) {
      setLastError(toUserMessage(error, "unableToTranscribeAudio"));
      posthogCapture("error_occurred", {
        error_type: "transcription_failed",
        error_message: toUserMessage(error, "unableToTranscribeAudio"),
      });
    } finally {
      removePendingTransaction(pendingId);
      stopProcessing();
    }
  }, [addPendingTransaction, parseTranscript, removePendingTransaction, saveSingleExpense, startProcessing, stopProcessing]);

  // Wire the END_SPEECH handler ref (now that processStreamingTranscript is defined)
  useEffect(() => {
    endOfSpeechHandlerRef.current = (transcript: string) => {
      posthogCapture("streaming_stt_end_of_speech", { transcript_length: transcript.length });
      // Close mic — user finished speaking, transition to processing state
      void streamingSTT.stop();
      void processStreamingTranscript(transcript);
    };
  }, [processStreamingTranscript, streamingSTT.stop]);

  const handleUndoTranscript = useCallback(async () => {
    if (!transcriptFeedback) return;
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    const { txId, amount, item, category, paymentMethod } = transcriptFeedback;
    setTranscriptFeedback(null);
    await deleteTransaction(txId);
    setDeletedTx({ id: txId, amount, item, category, paymentMethod: paymentMethod as Transaction["paymentMethod"], timestamp: Date.now() });
    posthogCapture("transaction_deleted", {
      amount,
      category,
      payment_method: paymentMethod,
      source: "undo",
    });
    refreshTransactions();
  }, [transcriptFeedback, refreshTransactions]);

  // Cleanup undo timeout on unmount
  useEffect(() => () => { if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current); }, []);

  const processReceiptDataUrl = useCallback(async (dataUrl: string) => {
    if (!startReceiptProcessing()) return;
    setLastError(null);
    const pendingId = addPendingTransaction(TRANSACTION_PENDING_LABEL);
    try {
      const blob = dataUrlToBlob(dataUrl);
      const normalized = await prepareReceiptImage(blob);
      const { parseReceiptWithGemini } = await import("@/src/services/receipt");
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
      // recordStreak();
      refreshTransactions();
      posthogCapture("transaction_added", {
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.paymentMethod ?? "cash",
        input_method: "receipt",
      });
    } catch (error) {
      setLastError(toUserMessage(error, "unableToProcessReceipt"));
      posthogCapture("error_occurred", {
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
    posthogCapture("receipt_upload_started", {
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
      posthogCapture("error_occurred", {
        error_type: "receipt_read_failed",
        error_message: toUserMessage(error, "unableToReadReceiptImage"),
      });
    }
  }, [processReceiptDataUrl]);

  const handleStopRecording = useCallback(async () => {
    // Flush + stop: sends remaining audio, gets final transcript
    const finalTranscript = await streamingSTT.stop();
    posthogCapture("recording_stopped", { streaming: true });
    // If END_SPEECH already fired and processed the transcript, this is a no-op.
    // Otherwise, process the final transcript from manual stop.
    if (finalTranscript.trim()) {
      void processStreamingTranscript(finalTranscript);
    }
  }, [streamingSTT, processStreamingTranscript]);

  const onMicPress = useCallback(() => {
    if (streamingSTT.isStreaming) {
      void handleStopRecording();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      void handleStartRecording();
    }
  }, [streamingSTT.isStreaming, handleStopRecording, handleStartRecording]);

  const onReceiptUploadClick = useCallback(() => {
    receiptInputRef.current?.click();
  }, []);

  // useDeferredValue for search/filter inputs to keep UI responsive
  const openEdit = useCallback(async (tx: Transaction) => {
    const isShared = await isTransactionShared(tx.id);
    setEditState({
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
    posthogCapture("history_viewed");
  }, []);

  const handleOpenSync = useCallback(() => {
    setIsSyncOpen(true);
  }, []);

  const handleOpenNotifications = useCallback(() => {
    setIsNotificationsOpen(true);
  }, []);

  const handleCloseNotifications = useCallback(() => {
    setIsNotificationsOpen(false);
  }, []);

  // Auto-open sync overlay when an incoming pairing request arrives
  useEffect(() => {
    if (incomingPair) {
      setIsSyncOpen(true);
    }
  }, [incomingPair]);

  const handleCloseSync = useCallback(() => {
    setIsSyncOpen(false);
  }, []);

  useBackButton(isSyncOpen, handleCloseSync);

  const handleTransactionDeleted = useCallback(
    (tx: Transaction) => {
      setDeletedTx(tx);
      refreshTransactions();
      posthogCapture("transaction_deleted", {
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
      if (!editState) return;
      const updated = buildTransaction(
        {
          ...data,
          is_private: data.isPrivate ?? false,
        },
        editState.id
      );
      await updateTransaction(editState.id, updated);
      setEditedTx(updated);
      posthogCapture("transaction_edited", {
        amount: data.amount,
        category: data.category,
        payment_method: data.paymentMethod,
      });
      startTransition(() => {
        setRefreshKey((prev) => prev + 1);
      });
      setEditState(null);
    },
    [editState]
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

  const handleTabChange = useCallback((tab: TabType) => {
    if (tab === "analytics") {
      handleOpenHistory();
      return;
    }
    setActiveTab(tab);
  }, [setActiveTab, handleOpenHistory]);

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
          <div className="flex items-center justify-between gap-3">
            {/* Logo + Streak */}
            <div className="min-w-0">
              <h1
                className="text-2xl font-bold font-[family:var(--font-display)] tracking-tight"
              >
                Kharcha<span className="text-[var(--kk-ember)]">Kitab</span>
                <span className="sr-only"> — Hinglish Voice Expense Tracker</span>
              </h1>
              {/* <div
                className="mt-0.5 flex items-center kk-header-fade-in kk-header-fade-in-delay"
              >
                <StreakBadge count={streakCount} broke={streakBroke} lostCount={streakLostCount} />
              </div> */}
            </div>

            {/* Action pill — all icons grouped */}
            <div
              className="kk-header-actions flex items-center kk-header-fade-in kk-header-fade-in-delay"
            >
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                aria-label="Chat assistant"
                className="kk-header-action-btn kk-header-action-accent active:scale-[0.88] transition-transform"
              >
                <Sparkles className="h-4 w-4" style={{ color: "var(--kk-ember)" }} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6">
        {/* Summary — always mounted, hidden when not active */}
        <div style={{ display: activeTab === "summary" ? undefined : "none" }}>
          <RecordingStatus
            isRecording={false}
            isProcessing={false}
            isReceiptProcessing={isReceiptProcessing}
            isTextProcessing={isTextProcessing}
          />
          <section>
            <HomeView
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
              onEmptyChange={setIsListEmpty}
            />
          </section>
        </div>

        {/* Recurring — always mounted, hidden when not active */}
        <section style={{ display: activeTab === "recurring" ? undefined : "none" }}>
          <RecurringView
            refreshKey={refreshKey}
            onAddRecurring={handleAddRecurring}
            onEditRecurring={handleEditRecurring}
            onMobileSheetChange={setIsTxnSheetOpen}
          />
        </section>

        <section style={{ display: activeTab === "profile" ? undefined : "none" }}>
          <ProfileView
            onOpenSync={handleOpenSync}
            onOpenNotifications={handleOpenNotifications}
          />
        </section>

      </main>

      {/* Bottom Tab Bar */}
      {!isTxnSheetOpen && (
        <>
          <AgentChat open={isChatOpen} onClose={() => setIsChatOpen(false)} />
          {/* <AgentFab /> */}
          <BottomTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            isRecording={isRecording}
            isSpeaking={streamingSTT.isUserSpeaking}
            isProcessing={isProcessing}
            isEmpty={isListEmpty}
            onMicPress={onMicPress}
            onTextSubmit={processTextInput}
            transcriptFeedback={transcriptFeedback ? { ...transcriptFeedback, currencySymbol } : null}
            onUndoTranscript={handleUndoTranscript}
          />
        </>
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
          onClose={handleCloseEdit}
          onSave={handleSaveEdit}
        />
      )}

      {/* Bulk Expense Preview Sheet */}
      {bulkExpenses && (
        <BulkExpensePreview
          expenses={bulkExpenses}
          currencySymbol={currencySymbol}
          onSave={handleBulkSave}
          onCancel={() => setBulkExpenses(null)}
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

      {/* History View — always mounted, slides in/out via CSS */}
      <AnalyticsView
        isOpen={isHistoryOpen}
        onClose={handleCloseHistory}
        onDeleted={handleHistoryDeleted}
        refreshKey={refreshKey}
        editedTx={editedTx}
        onEdit={openEdit}
        onImported={() => setRefreshKey((k) => k + 1)}
      />

      {/* Notifications Settings — full-screen overlay */}
      <NotificationsSettings
        isOpen={isNotificationsOpen}
        onClose={handleCloseNotifications}
      />

      {/* Sync Manager — full-screen overlay */}
      <SyncOverlay
        isOpen={isSyncOpen}
        onClose={handleCloseSync}
        onSyncComplete={refreshTransactions}
      />

      {/* PWA Install Banner (C1) */}
      {showInstallBanner && (
        <div
          className="fixed top-4 left-4 right-4 z-[150] mx-auto max-w-md overflow-hidden rounded-[var(--kk-radius-lg)] border border-[var(--kk-smoke)] bg-white/95 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl kk-toast-enter"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-ember)]/10 text-[var(--kk-ember)]">
              <Download className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[var(--kk-ink)]">Add to Home Screen</div>
              <div className="text-xs text-[var(--kk-ash)]">Quick access, works offline</div>
            </div>
            <button
              type="button"
              onClick={() => { setShowInstallBanner(false); dismissInstall(); }}
              className="kk-btn-ghost kk-btn-compact flex-shrink-0 text-xs"
            >
              Later
            </button>
            <button
              type="button"
              onClick={async () => {
                const outcome = await promptInstall();
                setShowInstallBanner(false);
                posthogCapture("pwa_install_prompted", { outcome: outcome ?? "unknown" });
              }}
              className="kk-btn-primary kk-btn-compact flex-shrink-0 text-xs"
            >
              Install
            </button>
          </div>
        </div>
      )}

      {/* Error Toast — fixed at top, visible on all tabs and scroll positions */}
      {lastError && (
        <div
          className="fixed left-4 right-4 top-4 z-[200] mx-auto max-w-md overflow-hidden rounded-[var(--kk-radius-lg)] border border-[rgba(229,72,77,0.24)] bg-white/90 px-4 py-3 shadow-[0_8px_32px_rgba(229,72,77,0.18)] backdrop-blur-xl kk-toast-enter"
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
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] origin-left bg-[var(--kk-danger)]/30 kk-progress-shrink"
          />
        </div>
      )}

      {/* Loading overlay for pending transitions */}
      {isPending && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--kk-void)]/10 pointer-events-none">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--kk-ember)] border-t-transparent" />
        </div>
      )}
    </div>
  );
};

export default function Home() {
  return (
    <AppProvider>
      <SignalingProvider>
        <AppShell />
      </SignalingProvider>
    </AppProvider>
  );
}
