"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Shield, Users, X, ArrowRight, Check, Handshake, AlertCircle } from "lucide-react";
import {
  getDeviceIdentity,
  getPairings,
  getSyncState,
  fetchTransactions,
  savePairing,
  removePairing,
  updatePartnerDisplayName,
} from "@/src/db/db";
import type { DeviceIdentity, PairingRecord, Transaction } from "@/src/types";
import { ICE_SERVERS } from "@/src/config/sync";
import {
  decryptPayload,
  deriveSessionKey,
  deriveSharedKey,
  encryptPayload,
  exportAesKey,
  exportPublicKey,
  generateKeyPair,
  importAesKey,
  importPublicKey,
} from "@/src/services/sync/crypto";
import { createPeerConnection } from "@/src/services/sync/webrtc";
import { applySyncPayload, buildSyncPayload, recordSyncError, getTotalChunks, type SyncPayload } from "@/src/services/sync/syncEngine";
import { getRangeForFilter } from "@/src/utils/dates";
import { useCurrency } from "@/src/hooks/useCurrency";
import { useSyncEvents } from "@/src/hooks/useSyncEvents";
import { useAppContext } from "@/src/context/AppContext";
import { useSignaling } from "@/src/context/SignalingContext";
import posthog from "posthog-js";

const generateCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const BUFFER_THRESHOLD = 64 * 1024; // 64 KB — pause sending when buffer exceeds this

const isProcessingRow = (tx: Transaction) =>
  tx.item === "Processing…" || tx.item.startsWith("Processing ");

interface SyncManagerProps {
  onSyncComplete?: () => void;
}

export const SyncManager = React.memo(({ onSyncComplete }: SyncManagerProps) => {
  const { symbol: currencySymbol, formatCurrency } = useCurrency();
  // ---------------------------------------------------------------------------
  // STATE & LOGIC
  // ---------------------------------------------------------------------------
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [nearbyDevices, setNearbyDevices] = useState<
    Array<{ device_id: string; display_name: string }>
  >([]);
  const [pairings, setPairings] = useState<PairingRecord[]>([]);
  const [syncStatus, setSyncStatus] = useState<string>("Not synced yet");
  const [syncSummary, setSyncSummary] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  type SyncPhase =
    | { status: 'connecting' }
    | { status: 'sending'; chunk: number; totalChunks: number }
    | { status: 'receiving'; received: number; total: number; chunk: number; totalChunks: number }
    | { status: 'done'; received: number }
    | null;
  const [syncPhase, setSyncPhase] = useState<SyncPhase>(null);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [incomingCode, setIncomingCode] = useState("");
  const [outgoingPair, setOutgoingPair] = useState<
    | {
      session_id: string;
      to_device_id: string;
      to_display_name: string;
      code: string;
    }
    | null
  >(null);
  const [isErrorFading, setIsErrorFading] = useState(false);
  const [confirmForgetId, setConfirmForgetId] = useState<string | null>(null);
  const confirmForgetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [householdTransactions, setHouseholdTransactions] = useState<Transaction[]>([]);

  // Get tab control from AppContext for auto-switch on pairing request
  const { incomingPair, setIncomingPair } = useAppContext();

  // Get shared signaling client from context
  const { client } = useSignaling();
  const pairingKeyRef = useRef<{
    session_id: string;
    code: string;
    keyPair: CryptoKeyPair;
    to_device_id: string;
    attempts: number;
  } | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const sharedKeyRef = useRef<CryptoKey | null>(null);
  const isSearchingRef = useRef(false);
  const identityRef = useRef(identity);
  const outgoingPairRef = useRef(outgoingPair);
  const incomingPairRef = useRef(incomingPair);
  const pairingsRef = useRef(pairings);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => { identityRef.current = identity; }, [identity]);
  useEffect(() => { outgoingPairRef.current = outgoingPair; }, [outgoingPair]);
  useEffect(() => { incomingPairRef.current = incomingPair; }, [incomingPair]);
  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);
  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  useEffect(() => {
    return () => {
      if (confirmForgetTimeoutRef.current) {
        clearTimeout(confirmForgetTimeoutRef.current);
      }
    };
  }, []);

  // Reset incoming code when a new pairing request arrives
  useEffect(() => {
    if (incomingPair) {
      setIncomingCode("");
    }
  }, [incomingPair]);

  // Auto-clear error messages after 5 seconds with fade animation
  useEffect(() => {
    if (errorMessage) {
      setIsErrorFading(false);
      const timer = setTimeout(() => {
        setIsErrorFading(true);
        setTimeout(() => {
          setErrorMessage(null);
        }, 500); // Wait for fade-out animation to complete
      }, 5000); // Show error for 5 seconds
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const { refreshTrigger } = useSyncEvents(pairings[0]?.partner_device_id);

  const partnerNameById = useMemo(() => {
    const map = new Map<string, string>();
    pairings.forEach((pairing) => {
      map.set(pairing.partner_device_id, pairing.partner_display_name);
    });
    return map;
  }, [pairings]);

  const partnerIds = useMemo(
    () => new Set(pairings.map((pairing) => pairing.partner_device_id)),
    [pairings]
  );

  const fetchHouseholdTransactions = useCallback(async () => {
    const range = getRangeForFilter("month");
    if (!range) return;
    const items = await fetchTransactions({ range: { start: range.start, end: range.end } });
    const filtered = items
      .filter((tx) => !tx.is_private && !tx.deleted_at && !isProcessingRow(tx))
      .sort((a, b) => b.timestamp - a.timestamp);
    setHouseholdTransactions(filtered);
  }, []);

  const refreshSyncState = useCallback(async () => {
    const currentIdentity = await getDeviceIdentity();
    if (!currentIdentity) return;

    const pairingsList = await getPairings();
    setPairings(pairingsList);
    if (pairingsList.length === 0) {
      setSyncStatus("No device paired");
      return;
    }
    const state = await getSyncState(pairingsList[0].partner_device_id);
    if (state?.last_sync_at) {
      const diff = Date.now() - state.last_sync_at;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      let relative = "Just now";
      if (minutes > 0) relative = `${minutes}m ago`;
      if (hours > 0) relative = `${hours}h ago`;
      if (days > 0) relative = `${days}d ago`;

      setSyncStatus(`Last sync: ${relative}`);
    } else {
      setSyncStatus("Not synced yet");
    }
  }, []);

  // We use the shared client from context, so no need for local connectSignaling

  const refreshNearby = useCallback(async () => {
    if (isSearchingRef.current) {
      return;
    }
    posthog.capture("nearby_refreshed");

    isSearchingRef.current = true;
    setIsSearching(true);
    setErrorMessage(null);
    try {
      // Fetch identity directly to avoid stale state
      const device = await getDeviceIdentity();
      if (!device) {

        setIsSearching(false);
        return;
      }

      if (!client) {
        setErrorMessage("Signaling not connected");
        setIsSearching(false);
        return;
      }
      await client.ensureConnected();
      client.send("presence:join", {
        device_id: device.device_id,
        display_name: device.display_name,
      });
      const partnerIds = pairingsRef.current.map((p) => p.partner_device_id);
      const list = await client.request<
        Array<{ device_id: string; display_name: string }>
      >("presence:list", { device_id: device.device_id, partner_device_ids: partnerIds });

      setNearbyDevices(list.filter((item) => item.device_id !== device.device_id));
    } catch (error) {

      setErrorMessage("Unable to discover nearby devices");
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, [client]);

  const preparePairing = async (deviceId: string, displayName: string) => {
    if (!identity) {
      console.warn("[Pairing] preparePairing called but identity is null");
      return;
    }
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Pairing] preparePairing initiated for device: ${displayName} (${deviceId})`);

    if (!client) {
      console.warn("[Pairing] preparePairing called but client is null");
      return;
    }
    await client.ensureConnected();
    const session_id = `pair_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const code = generateCode();
    const keyPair = await generateKeyPair();
    pairingKeyRef.current = { session_id, code, keyPair, to_device_id: deviceId, attempts: 0 };
    setOutgoingPair({ session_id, to_device_id: deviceId, to_display_name: displayName, code });

    console.log(`[${timestamp}] [Pairing] Sending pairing:request. Session: ${session_id}, Code: ${code}`);

    client.send("pairing:request", {
      session_id,
      from_device_id: identity.device_id,
      from_display_name: identity.display_name,
      to_device_id: deviceId,
    });
    if (typeof window !== "undefined") {
      const isMobile = window.matchMedia("(max-width: 1024px)").matches;
      if (isMobile) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  };

  const handleIncomingPairAccept = async () => {
    if (!incomingPair || !identity) return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Pairing] handleIncomingPairAccept. Session: ${incomingPair.session_id}, Code: ${incomingCode.trim()}`);

    posthog.capture("pair_accepted", { partner_device_id: incomingPair.from_device_id });
    if (!client) return;
    await client.ensureConnected();
    client.send("pairing:accept", {
      session_id: incomingPair.session_id,
      from_device_id: identity.device_id,
      to_device_id: incomingPair.from_device_id,
      code: incomingCode.trim(),
    });
  };

  const handleIncomingPairCancel = async () => {
    if (!incomingPair || !identity) return;
    posthog.capture("pair_cancelled", { partner_device_id: incomingPair.from_device_id });
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [Pairing] handleIncomingPairCancel. Session: ${incomingPair.session_id}`);

    if (!client) return;
    await client.ensureConnected();
    client.send("pairing:reject", {
      session_id: incomingPair.session_id,
      from_device_id: identity.device_id,
      to_device_id: incomingPair.from_device_id,
      reason: "cancelled",
      message: "Pairing request cancelled by receiver",
    });



    // Clear local state
    setIncomingPair(null);
    setIncomingCode("");

  };

  const handleSyncWith = async (partnerDeviceId: string) => {
    posthog.capture("sync_initiated", { partner_device_id: partnerDeviceId });
    setIsSyncing(true);
    setActivePartnerId(partnerDeviceId);
    setSyncSummary("");
    setErrorMessage(null);
    setSyncPhase({ status: 'connecting' });

    // Close any stale PC before starting a new one
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
      dataChannelRef.current = null;
    }

    if (!client) return;
    try {
      await client.ensureConnected();
      const pairing = pairings.find((p) => p.partner_device_id === partnerDeviceId);
      if (!pairing) {
        setErrorMessage("Please pair with this device first");
        return;
      }

      const sessionNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const sessionKey = await deriveSessionKey(pairing.shared_key_id, sessionNonce);
      sharedKeyRef.current = sessionKey;

      const totalChunks = await getTotalChunks(partnerDeviceId);

      const pc = createPeerConnection(
        { iceServers: ICE_SERVERS },
        (candidate) => {
          client.send("webrtc:candidate", {
            to_device_id: partnerDeviceId,
            from_device_id: identity?.device_id,
            candidate,
          });
        },
        undefined,
        (state) => {
          setConnectionState(state);
          if (state === 'connected') {
            void pc.getStats().then(stats => {
              let type = "P2P";
              stats.forEach(report => {
                if (report.type === "candidate-pair" && report.state === "succeeded") {
                  const local = stats.get(report.localCandidateId);
                  const remote = stats.get(report.remoteCandidateId);
                  if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') type = "Relay";
                }
              });
              setConnectionType(type);
            });
          }
          if (state === 'failed' || state === 'disconnected') {
            setErrorMessage("Connection lost. Try again.");
            setIsSyncing(false);
            setConnectionType(null);
          }
        }
      );
      peerConnectionRef.current = pc;
      const channel = pc.createDataChannel("sync", { ordered: true });
      dataChannelRef.current = channel;

      channel.onmessage = async (event) => {
        if (!sharedKeyRef.current) return;
        try {
          const payload = await decryptPayload<SyncPayload>(sharedKeyRef.current, JSON.parse(event.data));
          const chunkInfo = payload.chunk_info ?? { current: 1, total: 1 };
          const summary = await applySyncPayload(partnerDeviceId, payload, (progress) => {
            if (!progress) return;
            if (progress.received === progress.total_to_receive || progress.received % 10 === 0) {
              setSyncPhase({
                status: 'receiving',
                received: progress.received,
                total: progress.total_to_receive,
                chunk: chunkInfo.current,
                totalChunks: chunkInfo.total,
              });
            }
          });

          setSyncSummary(
            `Chunk ${chunkInfo.current}/${chunkInfo.total}: +${summary.received} items`
          );

          // Batch: only refresh after the last chunk
          if (chunkInfo.current === chunkInfo.total) {
            await refreshSyncState();
            await fetchHouseholdTransactions();
            setSyncPhase({ status: 'done', received: summary.received });
            setTimeout(() => { setSyncPhase(null); setIsSyncing(false); }, 1500);
            // Close PC after sync completes (initiator side)
            channel.close();
            pc.close();
            if (peerConnectionRef.current === pc) {
              peerConnectionRef.current = null;
              dataChannelRef.current = null;
            }
            // Notify parent that sync completed to refresh SummaryView data
            onSyncComplete?.();
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to process sync payload";
          await recordSyncError(partnerDeviceId, errorMsg);
          setErrorMessage(errorMsg);
        }
      };

      channel.onerror = (event) => {
        const rtcError = (event as RTCErrorEvent).error;
        // Ignore SCTP abort triggered by the remote side calling channel.close() — that's a normal close
        if (rtcError?.message?.includes("Close called")) return;
        console.error("[Sync] Initiator channel error:", rtcError?.errorDetail, rtcError?.message, "| PC state:", pc.connectionState, "| ICE state:", pc.iceConnectionState);
        setErrorMessage("Data channel error. Please retry.");
        setSyncPhase(null);
        setIsSyncing(false);
      };

      channel.onclose = () => {
        if (peerConnectionRef.current === pc) {
          peerConnectionRef.current = null;
          dataChannelRef.current = null;
        }
        // Responder closed the channel — all messages already delivered, sync is complete
        if (isSyncing) {
          setSyncPhase((prev) => prev?.status === 'done' ? prev : { status: 'done', received: 0 });
          setTimeout(() => { setSyncPhase(null); setIsSyncing(false); }, 1500);
          pc.close();
        }
      };

      channel.onopen = async () => {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          try {
            const outgoing = await buildSyncPayload(partnerDeviceId, chunkIndex);
            if (!sharedKeyRef.current) throw new Error("No session key");
            const encrypted = await encryptPayload(sharedKeyRef.current, outgoing);
            const serialized = JSON.stringify(encrypted);

            // Backpressure: wait until the send buffer drains before continuing
            if (channel.bufferedAmount > BUFFER_THRESHOLD) {
              await new Promise<void>((resolve) => {
                channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;
                channel.onbufferedamountlow = () => {
                  channel.onbufferedamountlow = null;
                  resolve();
                };
              });
            }

            if (channel.readyState !== 'open') break;
            channel.send(serialized);

            const currentChunk = chunkIndex + 1;
            setSyncSummary(`Sending chunk ${currentChunk}/${totalChunks}...`);
            setSyncPhase({ status: 'sending', chunk: currentChunk, totalChunks });
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Failed to send chunk";
            await recordSyncError(partnerDeviceId, errorMsg);
            throw error;
          }
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      client.send("webrtc:offer", {
        to_device_id: partnerDeviceId,
        from_device_id: identity?.device_id,
        sdp: pc.localDescription,
        session_nonce: sessionNonce,
      });

      const timeoutPc = pc;
      window.setTimeout(() => {
        if (peerConnectionRef.current === timeoutPc && timeoutPc.connectionState !== 'connected') {
          setErrorMessage("Connection timed out. Partner may be offline.");
          setIsSyncing(false);
        }
      }, 15000);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Sync failed";
      setErrorMessage(errorMsg);
      await recordSyncError(partnerDeviceId, errorMsg);
      setConnectionState("failed");
    } finally {
      setIsSyncing(false);
      setSyncPhase(null);
      if (connectionState !== 'failed') setActivePartnerId(null);
    }
  };

  const cancelSync = useCallback(() => {
    posthog.capture("sync_cancelled");
    setIsSyncing(false);
    setSyncPhase(null);
    setSyncSummary("Sync cancelled");
    peerConnectionRef.current?.close();
    dataChannelRef.current?.close();
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    setConnectionState("new");
    setActivePartnerId(null);
  }, []);

  useEffect(() => {
    void (async () => {

      const device = await getDeviceIdentity();
      setIdentity(device);

      // Initial data load
      await refreshSyncState();
      await fetchHouseholdTransactions();
      await refreshNearby();


    })();
  }, [fetchHouseholdTransactions, refreshNearby, refreshSyncState]);



  useEffect(() => {
    if (refreshTrigger > 0) {
      void fetchHouseholdTransactions();
      void refreshSyncState();
    }
  }, [refreshTrigger, fetchHouseholdTransactions, refreshSyncState]);

  useEffect(() => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DEBUG] Setting up signaling handlers...`);
    console.log(`[${timestamp}] [DEBUG] Identity:`, identity?.device_id);
    console.log(`[${timestamp}] [DEBUG] Client available:`, !!client);
    console.log(`[${timestamp}] [DEBUG] Client connected:`, client?.isConnected?.());

    if (!identity) {
      console.log(`[${timestamp}] [DEBUG] Skipping - no identity`);
      return;
    }
    if (!client) {
      console.log(`[${timestamp}] [DEBUG] Skipping - no client`);
      return;
    }

    console.log(`[${timestamp}] [DEBUG] Registering all signaling handlers...`);

    // Add a catch-all handler to log ALL incoming messages
    const offAllMessages = client.on("__any__", (payload) => {
      console.log(`[${new Date().toISOString()}] [DEBUG] Received ANY message:`, payload);
    });

    // Signaling event handlers
    const offPairRequest = () => { };


    const offPairAccept = client.on("pairing:accept", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:accept:`, payload);

      if (!payload || !pairingKeyRef.current || payload.session_id !== pairingKeyRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] pairing:accept ignored (session mismatch or no current pairing)`);
        return;
      }
      if (payload.code !== pairingKeyRef.current.code) {
        console.warn(`[${timestamp}] [Pairing] Code mismatch. Entered: ${payload.code}, Expected: ${pairingKeyRef.current.code}`);
        pairingKeyRef.current.attempts = (pairingKeyRef.current.attempts || 0) + 1;
        if (pairingKeyRef.current.attempts >= 3) {
          console.error(`[${timestamp}] [Pairing] Max attempts reached. Rejecting.`);
          client.send("pairing:reject", { session_id: payload.session_id, to_device_id: payload.from_device_id, reason: "max_attempts", message: "Too many incorrect attempts", final: true });
          setErrorMessage("Pairing failed: Partner entered wrong code too many times.");
          pairingKeyRef.current = null;
          setOutgoingPair(null);
        } else {
          client.send("pairing:reject", { session_id: payload.session_id, to_device_id: payload.from_device_id, reason: "wrong_code", message: "Incorrect code" });
        }
        return;
      }
      console.log(`[${timestamp}] [Pairing] Code verified! Sending pairing:confirm...`);
      const publicKey = await exportPublicKey(pairingKeyRef.current.keyPair.publicKey);
      client.send("pairing:confirm", { session_id: payload.session_id, from_device_id: identityRef.current?.device_id, to_device_id: payload.from_device_id, public_key: publicKey });
    });

    const offPairReject = client.on("pairing:reject", (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:reject:`, payload);

      // Check if this is for incoming pair (Device B receiving rejection - shouldn't happen but just in case)
      if (payload && incomingPairRef.current && payload.session_id === incomingPairRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] Handling reject for incoming pairing`);
        if (payload.reason === "wrong_code") {
          setErrorMessage(payload.message || "Incorrect code. Please try again.");
          setIncomingCode("");
        } else if (payload.reason === "max_attempts" || payload.reason === "expired" || payload.reason === "cancelled") {
          setErrorMessage(payload.message || "Pairing failed: " + (payload.message || "Session ended."));
          setIncomingPair(null);
          setIncomingCode("");
        }
        return;
      }

      // Check if this is for outgoing pair (Device A receiving rejection from Device B)
      if (payload && pairingKeyRef.current && payload.session_id === pairingKeyRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] Handling reject for outgoing pairing`);
        if (payload.reason === "cancelled") {
          setErrorMessage("Pairing request was declined by the other device.");
        } else if (payload.reason === "wrong_code") {
          setErrorMessage(payload.message || "Incorrect code. Please try again.");
        } else {
          setErrorMessage(payload.message || "Pairing failed.");
        }

        // Clear outgoing pair state
        pairingKeyRef.current = null;
        setOutgoingPair(null);

        return;
      }
    });

    const offPairCancel = client.on("pairing:cancel", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:cancel:`, payload);

      if (!payload) {
        return;
      }

      // Check if this is a disconnect message (reason="disconnected")
      if (payload.reason === "disconnected" && payload.to_device_id === identityRef.current?.device_id) {
        console.log(`[${timestamp}] [DEBUG] Received disconnect notification from:`, payload.from_device_id);

        // Check if this is from our current partner
        const currentPairing = pairingsRef.current.find(
          (p) => p.partner_device_id === payload.from_device_id
        );

        if (currentPairing) {
          console.log(`[${timestamp}] [DEBUG] Partner disconnected, removing pairing from DB...`);
          await removePairing(payload.from_device_id);
          await refreshSyncState();
          await fetchHouseholdTransactions();
          setSyncStatus("Partner disconnected");
          setNearbyDevices((prev) => prev.filter((d) => d.device_id !== payload.from_device_id));
          setErrorMessage("Your partner has disconnected. Pairing has been removed.");
          console.log(`[${timestamp}] [DEBUG] Disconnect handling completed`);
        }
        return;
      }

      // Original cancel handling for pairing requests
      if (!incomingPairRef.current) {
        return;
      }
      if (payload.session_id === incomingPairRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] Incoming pairing cancelled by remote`);
        setIncomingPair(null);
        setIncomingCode("");
      }
    });

    const offPairDisconnect = client.on("pairing:disconnect", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [DEBUG] Received pairing:disconnect message:`, JSON.stringify(payload));
      console.log(`[${timestamp}] [DEBUG] Current identity device_id:`, identityRef.current?.device_id);
      console.log(`[${timestamp}] [DEBUG] Current pairings:`, pairingsRef.current.map(p => ({ partner_id: p.partner_device_id, name: p.partner_display_name })));

      if (!payload) {
        console.log(`[${timestamp}] [DEBUG] Ignoring - no payload`);
        return;
      }

      if (payload.to_device_id !== identityRef.current?.device_id) {
        console.log(`[${timestamp}] [DEBUG] Ignoring - payload.to_device_id (${payload.to_device_id}) !== my device_id (${identityRef.current?.device_id})`);
        return;
      }

      // Check if this is from our current partner
      const currentPairing = pairingsRef.current.find(
        (p) => p.partner_device_id === payload.from_device_id
      );

      console.log(`[${timestamp}] [DEBUG] Found matching pairing:`, !!currentPairing);

      if (currentPairing) {
        console.log(`[${timestamp}] [DEBUG] Partner disconnected, removing pairing from DB...`);
        await removePairing(payload.from_device_id);
        console.log(`[${timestamp}] [DEBUG] Pairing removed, refreshing state...`);
        await refreshSyncState();
        await fetchHouseholdTransactions();
        setSyncStatus("Partner disconnected");
        setNearbyDevices((prev) => prev.filter((d) => d.device_id !== payload.from_device_id));
        setErrorMessage("Your partner has disconnected. Pairing has been removed.");
        console.log(`[${timestamp}] [DEBUG] pairing:disconnect handling completed`);
      } else {
        console.log(`[${timestamp}] [DEBUG] No matching pairing found for from_device_id:`, payload.from_device_id);
      }
    });

    const offError = client.on("error", (payload) => {
      const timestamp = new Date().toISOString();
      console.error(`[${timestamp}] [Pairing] Signaling error:`, payload);
      if (payload?.code === "PAIRING_EXPIRED") {
        setErrorMessage(payload.message || "Pairing session expired.");
        if (pairingKeyRef.current?.session_id) { pairingKeyRef.current = null; setOutgoingPair(null); }
        if (incomingPairRef.current) { setIncomingPair(null); setIncomingCode(""); }
      }
    });

    const offPairConfirm = client.on("pairing:confirm", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:confirm:`, payload);
      if (!payload || !incomingPairRef.current || payload.session_id !== incomingPairRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] pairing:confirm ignored (session mismatch or no incoming pairing)`);
        return;
      }
      console.log(`[${timestamp}] [Pairing] Derbying shared key and saving pairing...`);
      const keyPair = await generateKeyPair();
      const peerKey = await importPublicKey(payload.public_key);
      const sharedKey = await deriveSharedKey(keyPair.privateKey, peerKey);
      const sharedKeyRaw = await exportAesKey(sharedKey);
      await savePairing({ partner_device_id: incomingPairRef.current.from_device_id, partner_display_name: incomingPairRef.current.from_display_name, shared_key_id: sharedKeyRaw, created_at: Date.now(), trust_level: "paired" });
      const publicKey = await exportPublicKey(keyPair.publicKey);
      console.log(`[${timestamp}] [Pairing] Sending pairing:confirm-response...`);
      client.send("pairing:confirm-response", { session_id: incomingPairRef.current.session_id, from_device_id: identityRef.current?.device_id, to_device_id: incomingPairRef.current.from_device_id, public_key: publicKey });
      setIncomingPair(null);
      setIncomingCode("");
      await refreshSyncState();

      // Delayed refresh to allow partner to re-join presence
      console.log(`[${timestamp}] [Pairing] Scheduling delayed refreshNearby for presence sync...`);
      window.setTimeout(() => {
        console.log(`[${new Date().toISOString()}] [Pairing] Running delayed refreshNearby after pairing confirm`);
        void refreshNearby();
      }, 1500);
    });

    const offPairConfirmResponse = client.on("pairing:confirm-response", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:confirm-response:`, payload);
      if (!payload || !pairingKeyRef.current || payload.session_id !== pairingKeyRef.current.session_id) {
        console.log(`[${timestamp}] [Pairing] pairing:confirm-response ignored (session mismatch or no current pairing)`);
        return;
      }
      console.log(`[${timestamp}] [Pairing] Finalizing pairing on initiator side...`);
      const peerKey = await importPublicKey(payload.public_key);
      const sharedKey = await deriveSharedKey(pairingKeyRef.current.keyPair.privateKey, peerKey);
      const sharedKeyRaw = await exportAesKey(sharedKey);
      await savePairing({ partner_device_id: payload.from_device_id, partner_display_name: outgoingPairRef.current?.to_display_name ?? "Partner", shared_key_id: sharedKeyRaw, created_at: Date.now(), trust_level: "paired" });
      pairingKeyRef.current = null;
      setOutgoingPair(null);
      await refreshSyncState();
      console.log(`[${timestamp}] [Pairing] Pairing successful!`);

      // Delayed refresh to allow partner to finish their pairing flow and re-join presence
      console.log(`[${timestamp}] [Pairing] Scheduling delayed refreshNearby for presence sync...`);
      window.setTimeout(() => {
        console.log(`[${new Date().toISOString()}] [Pairing] Running delayed refreshNearby after pairing confirm-response`);
        void refreshNearby();
      }, 1500);
    });

    // Handle partner name change notifications
    const offNameChanged = client.on("pairing:name_changed", async (payload) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [Pairing] Received pairing:name_changed:`, payload);
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) {
        console.log(`[${timestamp}] [Pairing] pairing:name_changed ignored (not for us)`);
        return;
      }
      // Check if this is from our current partner
      const currentPairing = pairingsRef.current.find(
        (p) => p.partner_device_id === payload.from_device_id
      );
      if (currentPairing) {
        console.log(`[${timestamp}] [Pairing] Partner name changed from "${currentPairing.partner_display_name}" to "${payload.new_display_name}"`);
        await updatePartnerDisplayName(payload.from_device_id, payload.new_display_name);
        await refreshSyncState();
        console.log(`[${timestamp}] [Pairing] Partner name updated successfully`);
      }
    });

    const offOffer = client.on("webrtc:offer", async (payload) => {
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) return;
      const pairing = pairingsRef.current.find((p) => p.partner_device_id === payload.from_device_id);
      if (!pairing) return;

      // Perfect negotiation: handle simultaneous offer collision
      if (peerConnectionRef.current) {
        const existingState = peerConnectionRef.current.connectionState;
        if (existingState === 'failed' || existingState === 'disconnected' || existingState === 'closed') {
          // Stale connection — clean up and accept the incoming offer normally
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
          dataChannelRef.current = null;
        } else {
          // Active connection collision — lexicographic device_id tiebreak
          // Higher ID is polite (defers to incoming offer), lower ID is impolite (ignores it)
          const weArePolite = (identityRef.current?.device_id ?? '') > payload.from_device_id;
          if (!weArePolite) return;
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
          dataChannelRef.current = null;
          // Don't setIsSyncing(false) here — we're about to take over as responder below
          setActivePartnerId(payload.from_device_id);
        }
      }
      if (payload.session_nonce) {
        const sessionKey = await deriveSessionKey(pairing.shared_key_id, payload.session_nonce);
        sharedKeyRef.current = sessionKey;
      } else {
        const sharedKey = await importAesKey(pairing.shared_key_id);
        sharedKeyRef.current = sharedKey;
      }
      const pc = createPeerConnection(
        { iceServers: ICE_SERVERS },
        (candidate) => { client.send("webrtc:candidate", { to_device_id: payload.from_device_id, from_device_id: identityRef.current?.device_id, candidate }); },
        (channel) => {
          dataChannelRef.current = channel;
          channel.onmessage = async (event) => {
            if (!sharedKeyRef.current) return;
            try {
              const payloadData = await decryptPayload<SyncPayload>(sharedKeyRef.current, JSON.parse(event.data));
              const chunkInfo = payloadData.chunk_info ?? { current: 1, total: 1 };
              const summary = await applySyncPayload(payload.from_device_id, payloadData, (progress) => {
                if (!progress) return;
                if (progress.received === progress.total_to_receive || progress.received % 10 === 0) {
                  setSyncPhase({
                    status: 'receiving',
                    received: progress.received,
                    total: progress.total_to_receive,
                    chunk: chunkInfo.current,
                    totalChunks: chunkInfo.total,
                  });
                }
              });
              setSyncSummary(`Received ${summary.received} items.`);
              await refreshSyncState();
              await fetchHouseholdTransactions();
              if (chunkInfo.current === chunkInfo.total) {
                setSyncPhase({ status: 'done', received: summary.received });
                setTimeout(() => { setSyncPhase(null); setIsSyncing(false); setActivePartnerId(null); }, 1500);
                // Close PC after receiving all chunks (responder side)
                channel.close();
                pc.close();
                if (peerConnectionRef.current === pc) {
                  peerConnectionRef.current = null;
                  dataChannelRef.current = null;
                }
                // Notify parent that sync completed to refresh SummaryView data
                onSyncComplete?.();
              }
            } catch {
              setSyncPhase(null);
              setIsSyncing(false);
              setActivePartnerId(null);
            }
          };
          channel.onerror = (event) => {
            const rtcError = (event as RTCErrorEvent).error;
            // Ignore SCTP abort triggered by the remote side calling channel.close() — that's a normal close
            if (rtcError?.message?.includes("Close called")) return;
            console.error("[Sync] Responder channel error:", rtcError?.errorDetail, rtcError?.message, "| PC state:", pc.connectionState, "| ICE state:", pc.iceConnectionState);
            setSyncPhase(null);
            setIsSyncing(false);
            setActivePartnerId(null);
          };
          channel.onclose = () => {
            if (peerConnectionRef.current === pc) {
              peerConnectionRef.current = null;
              dataChannelRef.current = null;
            }
          };
          channel.onopen = async () => {
            const partnerDeviceId = payload.from_device_id;
            const totalChunks = await getTotalChunks(partnerDeviceId);
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
              if (!sharedKeyRef.current) return;
              const outgoing = await buildSyncPayload(partnerDeviceId, chunkIndex);
              const encrypted = await encryptPayload(sharedKeyRef.current, outgoing);
              const serialized = JSON.stringify(encrypted);

              // Backpressure: wait until the send buffer drains before continuing
              if (channel.bufferedAmount > BUFFER_THRESHOLD) {
                await new Promise<void>((resolve) => {
                  channel.bufferedAmountLowThreshold = BUFFER_THRESHOLD;
                  channel.onbufferedamountlow = () => {
                    channel.onbufferedamountlow = null;
                    resolve();
                  };
                });
              }

              if (channel.readyState !== 'open') break;
              channel.send(serialized);
            }
            // Signal to the initiator that we're done sending
            if (channel.readyState === 'open') channel.close();
          };
        },
        (state) => {
          setConnectionState(state);
          if (state === 'connected') {
            void pc.getStats().then(stats => {
              let type = "P2P";
              stats.forEach(report => { if (report.type === "candidate-pair" && report.state === "succeeded") { const local = stats.get(report.localCandidateId); const remote = stats.get(report.remoteCandidateId); if (local?.candidateType === 'relay' || remote?.candidateType === 'relay') type = "Relay"; } });
              setConnectionType(type);
            });
          }
          if (state === 'failed' || state === 'disconnected') {
            setConnectionType(null);
            setIsSyncing(false);
            setActivePartnerId(null);
          }
        }
      );
      peerConnectionRef.current = pc;
      setIsSyncing(true);
      try {
        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        client.send("webrtc:answer", { to_device_id: payload.from_device_id, from_device_id: identityRef.current?.device_id, sdp: pc.localDescription });
      } catch {
        setIsSyncing(false);
        setActivePartnerId(null);
        peerConnectionRef.current?.close();
        peerConnectionRef.current = null;
      }
    });

    const offAnswer = client.on("webrtc:answer", async (payload) => {
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) return;
      if (!peerConnectionRef.current) return;
      await peerConnectionRef.current.setRemoteDescription(payload.sdp);
    });

    const offCandidate = client.on("webrtc:candidate", async (payload) => {
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) return;
      if (!peerConnectionRef.current) return;
      try { await peerConnectionRef.current.addIceCandidate(payload.candidate); } catch { }
    });

    return () => {
      offPairRequest(); offPairAccept(); offPairConfirm(); offPairConfirmResponse();
      offOffer(); offAnswer(); offCandidate(); offPairReject(); offPairCancel(); offError();
      offPairDisconnect(); offNameChanged();
      // Don't disconnect - client is shared with SignalingProvider
      // BUT: close any active peer connection when effect re-runs to prevent stale connections
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        dataChannelRef.current = null;
      }
    };
  }, [client, identity?.device_id, refreshSyncState, fetchHouseholdTransactions]);



  const visibleDevices = useMemo(() => {
    const map = new Map<string, { device_id: string; display_name: string; status: 'online' | 'offline' }>();



    // Add online devices from discovery
    nearbyDevices.forEach(d => {

      map.set(d.device_id, { ...d, status: 'online' });
    });

    // Add paired devices (even if offline)
    pairings.forEach(p => {
      const existing = map.get(p.partner_device_id);
      if (existing) {

        // Update status to online if already present
        existing.status = 'online';
      } else {

        map.set(p.partner_device_id, { device_id: p.partner_device_id, display_name: p.partner_display_name, status: 'offline' });
      }
    });

    const result = Array.from(map.values());

    return result;
  }, [nearbyDevices, pairings]);



  // Human-readable partner name for display throughout the UI
  const partnerName = pairings[0]?.partner_display_name || "Partner";

  const handleForgetPartner = async (partnerDeviceId: string) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DEBUG] handleForgetPartner called for:`, partnerDeviceId);
    console.log(`[${timestamp}] [DEBUG] Current identity:`, identity?.device_id);
    console.log(`[${timestamp}] [DEBUG] Client available:`, !!client);
    console.log(`[${timestamp}] [DEBUG] Client connected:`, client?.isConnected?.());

    posthog.capture("partner_removed", { partner_device_id: partnerDeviceId });

    // Notify the other device that we're disconnecting
    if (client && identity) {
      try {
        console.log(`[${timestamp}] [DEBUG] Ensuring client is connected...`);
        await client.ensureConnected();
        console.log(`[${timestamp}] [DEBUG] Client connected, sending pairing:cancel (as disconnect)`);
        console.log(`[${timestamp}] [DEBUG] Sending from:`, identity.device_id, "to:", partnerDeviceId);
        // Use pairing:cancel with a special session_id that the server knows how to relay
        client.send("pairing:cancel", {
          session_id: `disconnect_${identity.device_id}_${partnerDeviceId}`,
          from_device_id: identity.device_id,
          to_device_id: partnerDeviceId,
          reason: "disconnected",
        });
        console.log(`[${timestamp}] [DEBUG] pairing:cancel (disconnect) message sent successfully`);
      } catch (err) {
        console.error(`[${timestamp}] [DEBUG] Failed to send disconnect notification:`, err);
      }
    } else {
      console.warn(`[${timestamp}] [DEBUG] Cannot send disconnect - client:`, !!client, "identity:", !!identity);
    }

    console.log(`[${timestamp}] [DEBUG] Removing pairing from local DB...`);
    await removePairing(partnerDeviceId);
    console.log(`[${timestamp}] [DEBUG] Pairing removed, refreshing state...`);
    await refreshSyncState();
    await fetchHouseholdTransactions();
    setSyncStatus("Partner removed");
    setNearbyDevices(prev => prev.filter(d => d.device_id !== partnerDeviceId));
    console.log(`[${timestamp}] [DEBUG] handleForgetPartner completed`);
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------

  const unpairedDevices = visibleDevices.filter(d => !partnerIds.has(d.device_id));
  const isPaired = pairings.length > 0;
  const isPartnerOnline = isPaired
    ? visibleDevices.find(d => d.device_id === pairings[0].partner_device_id)?.status === 'online'
    : false;

  // Incoming pair card — reused in both paired and unpaired states
  const incomingPairCard = incomingPair ? (
    <div className="kk-card kk-card-emphasis overflow-hidden animate-fade-up">
      <div className="bg-[var(--kk-cream)] px-5 py-3 border-b border-[var(--kk-smoke)]">
        <div className="flex items-center gap-3">
          <div className="kk-category-icon" style={{ borderRadius: 'var(--kk-radius-sm)' }}>
            <Handshake className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-[var(--kk-ink)]">{incomingPair.from_display_name} wants to connect</h3>
            <p className="kk-meta">Enter the code from their screen</p>
          </div>
        </div>
      </div>
      <div className="p-5 space-y-4">
        <input
          value={incomingCode}
          onChange={(e) => setIncomingCode(e.target.value)}
          placeholder="0000"
          maxLength={4}
          className="kk-input kk-code-input text-center"
          style={{ fontSize: '1.75rem', padding: '0.875rem 1rem' }}
        />
        <div className="flex gap-2">
          <button onClick={handleIncomingPairAccept} className="kk-btn-primary flex-1 justify-center gap-2">
            Verify <ArrowRight className="h-4 w-4" />
          </button>
          <button onClick={handleIncomingPairCancel} className="kk-btn-ghost justify-center">Not now</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="animate-fade-up pb-12 mx-auto w-full max-w-lg px-4 sm:px-6">

      {/* ── Error banner ── */}
      {errorMessage && (
        <div className={`kk-badge-error flex items-center gap-2 rounded-[var(--kk-radius-sm)] p-3 mb-4 text-sm font-medium transition-opacity duration-500 ${isErrorFading ? 'opacity-0' : 'opacity-100'}`}>
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="shrink-0 p-1 rounded-lg hover:bg-white/20">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {isPaired ? (
        /* ═══════════════════════════════════════════════════════
           PAIRED — Partner card with embedded sync
           ═══════════════════════════════════════════════════════ */
        <div className="space-y-4 mt-2">

          {/* Incoming pair request (can arrive when already paired) */}
          {incomingPairCard}

          {/* ── Partner card ── */}
          <div className="kk-card overflow-hidden">

            {/* 1. Identity */}
            <div className="flex items-center gap-3 p-4">
              <div className="kk-device-avatar">
                <span className="text-sm font-bold text-[var(--kk-ink)]">
                  {pairings[0].partner_display_name.charAt(0).toUpperCase()}
                </span>
                <div className={`kk-avatar-dot ${isPartnerOnline ? 'kk-avatar-online' : 'kk-avatar-offline'}`} />
              </div>
              <div className="kk-device-info">
                <div className="kk-device-name truncate">{pairings[0].partner_display_name}</div>
                <div className="kk-meta">{syncStatus}</div>
              </div>
              <button
                onClick={refreshNearby}
                disabled={isSearching}
                className="shrink-0 p-1.5 rounded-lg text-[var(--kk-ash)] hover:text-[var(--kk-ink)] disabled:opacity-50"
                aria-label="Refresh status"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSearching ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* 2. Action body — sync button or progress */}
            <div className="px-4 pb-4">
              {syncPhase ? (
                <div className="space-y-2.5">
                  {syncPhase.status === 'connecting' && (
                    <div className="flex items-center gap-2.5 text-sm text-[var(--kk-ash)]">
                      <span className="kk-status-dot kk-status-connecting" />
                      Connecting to {partnerName}…
                    </div>
                  )}
                  {syncPhase.status === 'sending' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-[var(--kk-ash)]">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />Sending…
                        </span>
                        <span className="kk-amount text-xs text-[var(--kk-ash)]">
                          {Math.round((syncPhase.chunk / syncPhase.totalChunks) * 100)}%
                        </span>
                      </div>
                      <div className="kk-progress-bar">
                        <div
                          className="kk-progress-fill kk-progress-fill-animated h-full"
                          style={{ transform: `scaleX(${syncPhase.chunk / syncPhase.totalChunks})` }}
                        />
                      </div>
                    </div>
                  )}
                  {syncPhase.status === 'receiving' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-[var(--kk-ash)]">
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />Receiving from {partnerName}…
                        </span>
                        <span className="kk-amount text-xs text-[var(--kk-ash)]">
                          {syncPhase.total > 0 ? `${Math.round((syncPhase.received / syncPhase.total) * 100)}%` : '…'}
                        </span>
                      </div>
                      <div className="kk-progress-bar">
                        <div
                          className="kk-progress-fill kk-progress-fill-animated h-full"
                          style={{ transform: `scaleX(${syncPhase.total > 0 ? syncPhase.received / syncPhase.total : syncPhase.chunk / syncPhase.totalChunks})` }}
                        />
                      </div>
                    </div>
                  )}
                  {syncPhase.status === 'done' && (
                    <div className="flex items-center gap-2.5 text-sm text-[var(--kk-sage)]">
                      <Check className="h-4 w-4" />
                      <span className="font-semibold">
                        {syncPhase.received > 0 ? `Synced ${syncPhase.received} ${syncPhase.received === 1 ? 'entry' : 'entries'}` : 'All caught up'}
                      </span>
                    </div>
                  )}
                  {syncPhase.status !== 'done' && (
                    <button onClick={cancelSync} className="kk-btn-ghost kk-btn-compact w-full justify-center">
                      Cancel
                    </button>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => handleSyncWith(pairings[0].partner_device_id)}
                  disabled={isSyncing}
                  className={`kk-btn-primary w-full justify-center gap-2 ${!isPartnerOnline ? 'opacity-60' : ''}`}
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Connecting…' : isPartnerOnline ? 'Sync now' : 'Try syncing'}
                </button>
              )}
            </div>

            {/* 3. Footer — disconnect */}
            <div className="border-t border-[var(--kk-smoke)] px-4 py-2.5 flex justify-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirmForgetId !== pairings[0].partner_device_id) {
                    setConfirmForgetId(pairings[0].partner_device_id);
                    if (confirmForgetTimeoutRef.current) clearTimeout(confirmForgetTimeoutRef.current);
                    confirmForgetTimeoutRef.current = setTimeout(() => setConfirmForgetId(null), 4000);
                    return;
                  }
                  setConfirmForgetId(null);
                  if (confirmForgetTimeoutRef.current) clearTimeout(confirmForgetTimeoutRef.current);
                  handleForgetPartner(pairings[0].partner_device_id);
                }}
                aria-label={confirmForgetId === pairings[0].partner_device_id ? `Confirm remove ${pairings[0].partner_display_name}` : `Remove ${pairings[0].partner_display_name}`}
                className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${confirmForgetId === pairings[0].partner_device_id
                  ? 'bg-[var(--kk-danger-bg)] text-[var(--kk-danger)]'
                  : 'text-[var(--kk-ash)] hover:text-[var(--kk-danger)] hover:bg-[var(--kk-danger-bg)]'
                  }`}
              >
                {confirmForgetId === pairings[0].partner_device_id ? 'Confirm' : 'Disconnect'}
              </button>
            </div>
          </div>

        </div>

      ) : (
        /* ═══════════════════════════════════════════════════════
           UNPAIRED — Find partner or pairing flow
           ═══════════════════════════════════════════════════════ */
        <div className="mt-8">
          {incomingPair ? (
            <div className="mx-auto max-w-sm">{incomingPairCard}</div>

          ) : outgoingPair ? (
            /* Outgoing pair — code display */
            <div className="kk-card animate-fade-up mx-auto max-w-sm">
              <div className="p-6 text-center">
                <Shield className="h-8 w-8 text-[var(--kk-ember)] mx-auto mb-3" />
                <h3 className="kk-heading text-lg">Share this code</h3>
                <p className="kk-meta mt-1.5 mx-auto max-w-[14rem]">
                  Ask {outgoingPair.to_display_name} to enter this on their screen
                </p>
                <div className="kk-pairing-code my-6">
                  {outgoingPair.code.split('').map((digit, i) => (
                    <div key={i} className="kk-code-digit animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>{digit}</div>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    const toDeviceId = pairingKeyRef.current?.to_device_id;
                    const sessionId = pairingKeyRef.current?.session_id;
                    setOutgoingPair(null);
                    pairingKeyRef.current = null;
                    if (toDeviceId && sessionId && identityRef.current && client) {
                      try {
                        await client.ensureConnected();
                        client.send("pairing:cancel", {
                          session_id: sessionId,
                          to_device_id: toDeviceId,
                          from_device_id: identityRef.current?.device_id,
                          from_display_name: identityRef.current?.display_name,
                        });
                      } catch { }
                    }
                  }}
                  className="kk-btn-ghost kk-btn-compact"
                >
                  Cancel
                </button>
              </div>
            </div>

          ) : (
            /* Find partner — empty state */
            <div className="kk-empty-state mx-auto max-w-sm">
              <Users className="h-10 w-10 text-[var(--kk-ash)] opacity-40" />
              <h2 className="kk-heading text-xl">Better together</h2>
              <div className="kk-empty-description">
                Pair with your partner to share your household expenses in one place.
              </div>
              <button onClick={refreshNearby} disabled={isSearching} className="kk-btn-primary gap-2">
                <Users className="h-4 w-4" />
                {isSearching ? 'Searching…' : 'Find Partner'}
              </button>
              {unpairedDevices.length > 0 && (
                <div className="w-full space-y-2 mt-3">
                  <div className="kk-label text-center">Nearby devices</div>
                  {unpairedDevices.map(device => (
                    <button
                      key={device.device_id}
                      onClick={() => device.status === 'online' && preparePairing(device.device_id, device.display_name)}
                      disabled={device.status !== 'online'}
                      className="kk-device-card w-full"
                    >
                      <div className="kk-device-button">
                        <div className="kk-device-avatar">
                          <span className="text-xs font-bold text-[var(--kk-ink)]">
                            {device.display_name.charAt(0).toUpperCase()}
                          </span>
                          <div className={`kk-avatar-dot ${device.status === 'online' ? 'kk-avatar-online' : 'kk-avatar-offline'}`} />
                        </div>
                        <div className="kk-device-info">
                          <div className="kk-device-name text-sm">{device.display_name}</div>
                          <div className="kk-meta">{device.status === 'online' ? 'Tap to pair' : 'Offline'}</div>
                        </div>
                        {device.status === 'online' && <ArrowRight className="h-4 w-4 text-[var(--kk-ember)]" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

SyncManager.displayName = "SyncManager";
