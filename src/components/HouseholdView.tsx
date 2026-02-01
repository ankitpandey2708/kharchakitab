"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, RefreshCw, Shield, Users, X, XCircle, AlertCircle, Smartphone, ArrowRight, Check, Wifi, WifiOff, Clock, ChevronRight, TrendingUp } from "lucide-react";
import {
  clearConflict,
  getDeviceIdentity,
  getPairings,
  getSyncState,
  getTransactionById,
  getTransactionVersions,
  fetchTransactions,
  savePairing,
  removePairing,
  setDeviceDisplayName,
  updateTransaction,
} from "@/src/db/db";
import type { DeviceIdentity, PairingRecord, Transaction } from "@/src/types";
import { SIGNALING_URL, ICE_SERVERS } from "@/src/config/sync";
import { SignalingClient } from "@/src/services/sync/signalingClient";
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
import { formatCurrency } from "@/src/utils/money";
import { TransactionRow } from "@/src/components/TransactionRow";
import { useSyncEvents } from "@/src/hooks/useSyncEvents";
import { useAppContext } from "@/src/context/AppContext";
import { useSignaling } from "@/src/context/SignalingContext";

const generateCode = () => Math.floor(1000 + Math.random() * 9000).toString();

const isProcessingRow = (tx: Transaction) =>
  tx.item === "Processing…" || tx.item.startsWith("Processing ");

export const HouseholdView = () => {
  // ---------------------------------------------------------------------------
  // STATE & LOGIC
  // ---------------------------------------------------------------------------
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
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
  const [syncProgress, setSyncProgress] = useState<{
    current: number;
    total: number;
    chunks: { current: number; total: number };
  } | null>(null);
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
  const [conflictIds, setConflictIds] = useState<string[]>([]);
  const [showConflicts, setShowConflicts] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<string | null>(null);
  const [conflictVersions, setConflictVersions] = useState<
    { snapshot: Transaction; editorId: string; updatedAt: number }[]
  >([]);
  const [isErrorFading, setIsErrorFading] = useState(false);

  // UX State: Control filtering and view limit
  const [householdFilter, setHouseholdFilter] = useState<"all" | "you" | "partner">("all");
  const [isEditingName, setIsEditingName] = useState(false);
  const [viewMode, setViewMode] = useState<"recent" | "full">("recent");
  const [householdTransactions, setHouseholdTransactions] = useState<Transaction[]>([]);

  // Get tab control from AppContext for auto-switch on pairing request
  const { setActiveTab, incomingPair, setIncomingPair } = useAppContext();

  // Get shared signaling client from context
  const { client } = useSignaling();

  const clientRef = useRef<SignalingClient | null>(null);
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

  useEffect(() => { identityRef.current = identity; }, [identity]);
  useEffect(() => { outgoingPairRef.current = outgoingPair; }, [outgoingPair]);
  useEffect(() => { incomingPairRef.current = incomingPair; }, [incomingPair]);
  useEffect(() => { pairingsRef.current = pairings; }, [pairings]);

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
    }
    setConflictIds(state?.conflicts ?? []);
  }, []);

  const connectSignaling = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.ensureConnected();
      return clientRef.current;
    }
    const client = new SignalingClient(SIGNALING_URL);
    clientRef.current = client;
    await client.connect();
    return client;
  }, []);

  const refreshNearby = useCallback(async () => {
    if (isSearchingRef.current) {
      return;
    }

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

      const client = await connectSignaling();
      client.send("presence:join", {
        device_id: device.device_id,
        display_name: device.display_name,
      });
      const list = await client.request<
        Array<{ device_id: string; display_name: string }>
      >("presence:list", { device_id: device.device_id });
      const filtered = list.filter((item) => item.device_id !== device.device_id);

      setNearbyDevices(filtered);
    } catch (error) {

      setErrorMessage("Unable to discover nearby devices");
    } finally {
      isSearchingRef.current = false;
      setIsSearching(false);
    }
  }, [connectSignaling]);

  const preparePairing = async (deviceId: string, displayName: string) => {
    if (!identity) return;
    const client = await connectSignaling();
    const session_id = `pair_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const code = generateCode();
    const keyPair = await generateKeyPair();
    pairingKeyRef.current = { session_id, code, keyPair, to_device_id: deviceId, attempts: 0 };
    setOutgoingPair({ session_id, to_device_id: deviceId, to_display_name: displayName, code });
    client.send("pairing:request", {
      session_id,
      from_device_id: identity.device_id,
      from_display_name: identity.display_name,
      to_device_id: deviceId,
    });
  };

  const handleIncomingPairAccept = async () => {
    if (!incomingPair || !identity) return;
    const client = await connectSignaling();
    client.send("pairing:accept", {
      session_id: incomingPair.session_id,
      from_device_id: identity.device_id,
      to_device_id: incomingPair.from_device_id,
      code: incomingCode.trim(),
    });
  };

  const handleIncomingPairCancel = async () => {
    if (!incomingPair || !identity) return;
    const timestamp = new Date().toISOString();



    const client = await connectSignaling();
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
    setIsSyncing(true);
    setActivePartnerId(partnerDeviceId);
    setSyncSummary("");
    setErrorMessage(null);
    setSyncProgress(null);

    try {
      const client = await connectSignaling();
      const pairing = pairings.find((p) => p.partner_device_id === partnerDeviceId);
      if (!pairing) {
        setErrorMessage("Please pair with this device first");
        return;
      }

      const sessionNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const sessionKey = await deriveSessionKey(pairing.shared_key_id, sessionNonce);
      sharedKeyRef.current = sessionKey;

      const totalChunks = await getTotalChunks(partnerDeviceId);
      let totalReceived = 0;

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
            setSyncProgress({
              current: progress.received,
              total: progress.total_to_receive,
              chunks: { current: chunkInfo.current, total: chunkInfo.total },
            });
          });

          totalReceived += summary.received;
          setSyncSummary(
            `Chunk ${chunkInfo.current}/${chunkInfo.total}: +${summary.received} items`
          );

          await refreshSyncState();
          await fetchHouseholdTransactions();
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Failed to process sync payload";
          await recordSyncError(partnerDeviceId, errorMsg);
          setErrorMessage(errorMsg);
        }
      };

      channel.onopen = async () => {
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
          try {
            const outgoing = await buildSyncPayload(partnerDeviceId, chunkIndex);
            if (!sharedKeyRef.current) throw new Error("No session key");
            const encrypted = await encryptPayload(sharedKeyRef.current, outgoing);
            channel.send(JSON.stringify(encrypted));

            const currentChunk = chunkIndex + 1;
            setSyncSummary(`Sending chunk ${currentChunk}/${totalChunks}...`);
            setSyncProgress({
              current: outgoing.transactions.length,
              total: outgoing.transactions.length,
              chunks: { current: currentChunk, total: totalChunks },
            });

            if (chunkIndex < totalChunks - 1) await new Promise(resolve => setTimeout(resolve, 100));
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

      window.setTimeout(() => {
        if (peerConnectionRef.current && peerConnectionRef.current.connectionState !== 'connected') {
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
      setSyncProgress(null);
      if (connectionState !== 'failed') setActivePartnerId(null);
    }
  };

  const cancelSync = useCallback(() => {
    setIsSyncing(false);
    setSyncProgress(null);
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
      setDisplayNameDraft(device.display_name);

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
    if (!identity) {

      return;
    }

    if (!client) {

      return;
    }


    clientRef.current = client;

    // Signaling event handlers
    const offPairRequest = () => { };


    const offPairAccept = client.on("pairing:accept", async (payload) => {
      if (!payload || !pairingKeyRef.current || payload.session_id !== pairingKeyRef.current.session_id) return;
      if (payload.code !== pairingKeyRef.current.code) {
        pairingKeyRef.current.attempts = (pairingKeyRef.current.attempts || 0) + 1;
        if (pairingKeyRef.current.attempts >= 3) {
          client.send("pairing:reject", { session_id: payload.session_id, to_device_id: payload.from_device_id, reason: "max_attempts", message: "Too many incorrect attempts", final: true });
          setErrorMessage("Pairing failed: Partner entered wrong code too many times.");
          pairingKeyRef.current = null;
          setOutgoingPair(null);
        } else {
          client.send("pairing:reject", { session_id: payload.session_id, to_device_id: payload.from_device_id, reason: "wrong_code", message: "Incorrect code" });
        }
        return;
      }
      const publicKey = await exportPublicKey(pairingKeyRef.current.keyPair.publicKey);
      client.send("pairing:confirm", { session_id: payload.session_id, from_device_id: identityRef.current?.device_id, to_device_id: payload.from_device_id, public_key: publicKey });
    });

    const offPairReject = client.on("pairing:reject", (payload) => {
      const timestamp = new Date().toISOString();

      // Check if this is for incoming pair (Device B receiving rejection - shouldn't happen but just in case)
      if (payload && incomingPairRef.current && payload.session_id === incomingPairRef.current.session_id) {

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

    const offPairCancel = client.on("pairing:cancel", (payload) => {
      const timestamp = new Date().toISOString();


      if (!payload || !incomingPairRef.current) {

        return;
      }
      if (payload.session_id === incomingPairRef.current.session_id) {


        setIncomingPair(null);
        setIncomingCode("");

      } else {

      }
    });

    const offError = client.on("error", (payload) => {
      if (payload?.code === "PAIRING_EXPIRED") {
        setErrorMessage(payload.message || "Pairing session expired.");
        if (pairingKeyRef.current?.session_id) { pairingKeyRef.current = null; setOutgoingPair(null); }
        if (incomingPairRef.current) { setIncomingPair(null); setIncomingCode(""); }
      }
    });

    const offPairConfirm = client.on("pairing:confirm", async (payload) => {
      if (!payload || !incomingPairRef.current || payload.session_id !== incomingPairRef.current.session_id) return;
      const keyPair = await generateKeyPair();
      const peerKey = await importPublicKey(payload.public_key);
      const sharedKey = await deriveSharedKey(keyPair.privateKey, peerKey);
      const sharedKeyRaw = await exportAesKey(sharedKey);
      await savePairing({ partner_device_id: incomingPairRef.current.from_device_id, partner_display_name: incomingPairRef.current.from_display_name, shared_key_id: sharedKeyRaw, created_at: Date.now(), trust_level: "paired" });
      const publicKey = await exportPublicKey(keyPair.publicKey);
      client.send("pairing:confirm-response", { session_id: incomingPairRef.current.session_id, from_device_id: identityRef.current?.device_id, to_device_id: incomingPairRef.current.from_device_id, public_key: publicKey });
      setIncomingPair(null);
      setIncomingCode("");
      await refreshSyncState();
    });

    const offPairConfirmResponse = client.on("pairing:confirm-response", async (payload) => {
      if (!payload || !pairingKeyRef.current || payload.session_id !== pairingKeyRef.current.session_id) return;
      const peerKey = await importPublicKey(payload.public_key);
      const sharedKey = await deriveSharedKey(pairingKeyRef.current.keyPair.privateKey, peerKey);
      const sharedKeyRaw = await exportAesKey(sharedKey);
      await savePairing({ partner_device_id: payload.from_device_id, partner_display_name: outgoingPairRef.current?.to_display_name ?? "Partner", shared_key_id: sharedKeyRaw, created_at: Date.now(), trust_level: "paired" });
      pairingKeyRef.current = null;
      setOutgoingPair(null);
      await refreshSyncState();
    });

    const offOffer = client.on("webrtc:offer", async (payload) => {
      if (!payload || payload.to_device_id !== identityRef.current?.device_id) return;
      const pairing = pairingsRef.current.find((p) => p.partner_device_id === payload.from_device_id);
      if (!pairing) return;
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
            const payloadData = await decryptPayload<SyncPayload>(sharedKeyRef.current, JSON.parse(event.data));
            const summary = await applySyncPayload(payload.from_device_id, payloadData);
            setSyncSummary(`Received ${summary.received} items. Conflicts: ${summary.conflicts}`);
            await refreshSyncState();
            await fetchHouseholdTransactions();
          };
          channel.onopen = async () => {
            const outgoing = await buildSyncPayload(payload.from_device_id);
            if (!sharedKeyRef.current) return;
            const encrypted = await encryptPayload(sharedKeyRef.current, outgoing);
            channel.send(JSON.stringify(encrypted));
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
          if (state === 'failed' || state === 'disconnected') setConnectionType(null);
        }
      );
      peerConnectionRef.current = pc;
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      client.send("webrtc:answer", { to_device_id: payload.from_device_id, from_device_id: identityRef.current?.device_id, sdp: pc.localDescription });
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
      // Don't disconnect - client is shared with SignalingProvider
      clientRef.current = null;
    };
  }, [identity?.device_id, refreshSyncState, fetchHouseholdTransactions]);



  useEffect(() => {
    if (conflictIds.length > 0) setShowConflicts(true);
  }, [conflictIds]);

  useEffect(() => {
    if (!selectedConflict) { setConflictVersions([]); return; }
    void (async () => {
      const base = await getTransactionById(selectedConflict);
      if (!base) return;
      const versions = await getTransactionVersions(selectedConflict);
      const uniqueVersions = new Map<string, { snapshot: Transaction; editorId: string; updatedAt: number }>();
      versions.forEach((version) => { uniqueVersions.set(version.editor_device_id + version.updated_at, { snapshot: version.payload_snapshot, editorId: version.editor_device_id, updatedAt: version.updated_at }); });
      if (uniqueVersions.size < 2 && base) { uniqueVersions.set("current", { snapshot: base, editorId: base.owner_device_id || "unknown", updatedAt: base.updated_at ?? base.timestamp }); }
      setConflictVersions(Array.from(uniqueVersions.values()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2));
    })();
  }, [selectedConflict]);

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

  // UX Calculation: Totals for the "Monthly Pulse"
  const totals = useMemo(() => {
    let you = 0;
    let partner = 0;
    householdTransactions.forEach(tx => {
      if (tx.owner_device_id === identity?.device_id) you += tx.amount;
      else partner += tx.amount;
    });
    const total = you + partner;
    const youPct = total > 0 ? (you / total) * 100 : 0;
    return { you, partner, total, youPct };
  }, [householdTransactions, identity]);

  const filteredTransactions = useMemo(() => {
    let txs = householdTransactions;
    if (householdFilter !== "all") {
      txs = txs.filter((tx) => householdFilter === "you" ? tx.owner_device_id === identity?.device_id : tx.owner_device_id !== identity?.device_id);
    }
    // "Recent" view mode limits to 5 items to reduce load
    if (viewMode === "recent") {
      return txs.slice(0, 5);
    }
    return txs;
  }, [householdFilter, householdTransactions, identity, viewMode]);

  const handleResolveConflict = async (transaction: Transaction) => {
    if (!selectedConflict) return;
    await updateTransaction(selectedConflict, { ...transaction, conflict: false });
    if (pairings[0]) await clearConflict(pairings[0].partner_device_id, selectedConflict);
    setSelectedConflict(null);
    await refreshSyncState();
    await fetchHouseholdTransactions();
  };

  const handleForgetPartner = async (partnerDeviceId: string) => {
    if (!confirm("Are you sure you want to forget this partner?")) return;
    await removePairing(partnerDeviceId);
    await refreshSyncState();
    await fetchHouseholdTransactions();
    setSyncStatus("Partner removed");
    setNearbyDevices(prev => prev.filter(d => d.device_id !== partnerDeviceId));
  };

  const saveDisplayName = async () => {
    if (displayNameDraft.trim()) {
      await setDeviceDisplayName(displayNameDraft);
      const updated = await getDeviceIdentity();
      setIdentity(updated);
      setIsEditingName(false);
      await refreshNearby();
    }
  };

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
  return (
    <div className="animate-fade-up space-y-6 pb-12 mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
      {/* HEADER: Identity & Actions */}
      <header className="overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white p-6 shadow-lg md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--kk-smoke-heavy)] bg-[var(--kk-paper)] px-3 py-1">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--kk-ember)] shadow-[0_0_6px_var(--kk-ember)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--kk-ash)]">Household Sync</span>
            </div>
            <h2 className="kk-heading text-3xl tracking-tight text-[var(--kk-ink)] sm:text-4xl">
              Shared <span className="bg-gradient-to-r from-[var(--kk-ember)] to-[var(--kk-saffron)] bg-clip-text text-transparent">Ledger</span>
            </h2>
            <p className="mt-2 text-sm text-[var(--kk-ash)]">Private, device-to-device syncing. No cloud, no accounts.</p>
          </div>

          {/* Device Identity Pill */}
          <div className="group flex items-center self-start gap-3 rounded-2xl border border-[var(--kk-smoke-heavy)] bg-[var(--kk-paper)] px-4 py-3 transition-all duration-300 hover:border-[var(--kk-ember)]/40 hover:shadow-md md:self-auto">
            <div className="relative">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--kk-ember)] to-[var(--kk-ember-deep)] text-white shadow-lg shadow-[var(--kk-ember)]/30">
                <Smartphone className="h-5 w-5" />
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[var(--kk-sage)]" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--kk-ash)]">This device</span>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    className="w-28 bg-transparent text-sm font-semibold text-[var(--kk-ink)] focus:outline-none"
                    value={displayNameDraft}
                    onChange={(e) => setDisplayNameDraft(e.target.value)}
                    onBlur={saveDisplayName}
                    onKeyDown={(e) => e.key === 'Enter' && saveDisplayName()}
                  />
                  <button onClick={saveDisplayName} className="rounded-full p-1 text-[var(--kk-sage)] hover:bg-[var(--kk-sage-bg)]">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-[var(--kk-ink)] transition-colors hover:text-[var(--kk-ember)]"
                >
                  <span>{identity?.display_name || "Unknown Device"}</span>
                  <Copy className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ERROR / ALERTS */}
      {errorMessage && (
        <div className={`kk-badge-error flex w-full items-center gap-2 rounded-lg p-3 px-4 text-sm font-medium transition-opacity duration-500 ${isErrorFading ? 'opacity-0' : 'opacity-100'}`}>
          <AlertCircle className="h-4 w-4" />
          {errorMessage}
          <button onClick={() => setErrorMessage(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* GRID LAYOUT */}
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-8">

        {/* LEFT COLUMN: Status & Discovery (4 cols) */}
        <div className="lg:col-span-4">
          <div className="space-y-5">

            {/* Sync Status Card - Enhanced */}
            <div className="group relative overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white p-[1px] shadow-lg transition-all duration-300 hover:shadow-xl">
              {/* Animated gradient border on hover */}
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--kk-ember)]/20 via-transparent to-[var(--kk-saffron)]/20 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

              <div className="relative rounded-2xl bg-white p-6">
                {/* Status orb decoration */}
                <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full transition-all duration-500 ${connectionState === 'connected' ? 'bg-[var(--kk-sage)]/10' :
                  connectionState === 'connecting' ? 'bg-[var(--kk-saffron)]/15 animate-pulse' :
                    'bg-[var(--kk-smoke)]'
                  }`} />

                <div className="relative z-10">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--kk-ash)]">Connection</span>
                    <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${connectionState === 'connected' ? 'bg-[var(--kk-sage-bg)] text-[var(--kk-sage)]' :
                      connectionState === 'connecting' ? 'bg-[var(--kk-saffron)]/10 text-[var(--kk-saffron)]' :
                        'bg-[var(--kk-smoke)] text-[var(--kk-ash)]'
                      }`}>
                      <div className={`h-1.5 w-1.5 rounded-full ${connectionState === 'connected' ? 'bg-[var(--kk-sage)] shadow-[0_0_6px_var(--kk-sage)]' :
                        connectionState === 'connecting' ? 'bg-[var(--kk-saffron)] animate-pulse' :
                          'bg-[var(--kk-ash)]'
                        }`} />
                      {connectionState === 'connected' ? 'Live' : connectionState === 'connecting' ? 'Syncing' : 'Idle'}
                    </div>
                  </div>

                  <div className="mb-1 text-xl font-bold text-[var(--kk-ink)]">
                    {connectionState === 'connected' ? "Connected" :
                      connectionState === 'connecting' ? "Syncing..." :
                        syncStatus}
                  </div>

                  {connectionType && (
                    <div className="mb-4 flex items-center gap-1.5 text-xs font-medium text-[var(--kk-ash)]">
                      <Wifi className="h-3.5 w-3.5" /> via {connectionType}
                    </div>
                  )}

                  <div className="mt-5">
                    {isSyncing ? (
                      <button onClick={cancelSync} className="w-full rounded-xl border-2 border-[var(--kk-danger)]/20 bg-[var(--kk-danger-bg)] px-4 py-3 text-sm font-semibold text-[var(--kk-danger)] transition-all hover:border-[var(--kk-danger)]/40 hover:bg-[var(--kk-danger)]/10">
                        Cancel sync
                      </button>
                    ) : pairings[0] ? (
                      <button
                        onClick={() => handleSyncWith(pairings[0].partner_device_id)}
                        className="w-full kk-btn-primary py-3.5"
                        disabled={connectionState === 'connecting'}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${connectionState === 'connecting' ? 'animate-spin' : ''}`} />
                        Sync now
                      </button>
                    ) : (
                      <button
                        onClick={() => { refreshNearby(); }}
                        className="w-full kk-btn-primary py-3.5"
                        disabled={isSearching}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        {isSearching ? 'Searching...' : 'Search nearby'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Device List Card - Enhanced */}
            <div className="overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white shadow-md">
              <div className="border-b border-[var(--kk-smoke)] bg-gradient-to-r from-[var(--kk-cream)] to-white px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--kk-ink)] text-white">
                      <Users className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-sm font-semibold text-[var(--kk-ink)]">Nearby</span>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${isSearching ? 'animate-pulse bg-[var(--kk-saffron)]/10 text-[var(--kk-saffron)]' : 'bg-[var(--kk-smoke)] text-[var(--kk-ash)]'
                    }`}>
                    {isSearching ? "Scanning..." : `${visibleDevices.length} found`}
                  </span>
                </div>
              </div>

              <div className="p-4">
                <p className="mb-4 text-xs text-[var(--kk-ash)]">Tap to pair, or tap a paired device to sync.</p>

                <div className="space-y-2">
                  {visibleDevices.length === 0 ? (
                    <div className="py-8 text-center">
                      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--kk-smoke)] text-[var(--kk-ash)]">
                        <WifiOff className="h-5 w-5" />
                      </div>
                      <p className="text-sm font-medium text-[var(--kk-ash)]">No devices nearby</p>
                      <p className="mt-1 text-xs text-[var(--kk-ash)]/70">Make sure both devices have the app open</p>
                    </div>
                  ) : (
                    visibleDevices.map((device, idx) => {
                      const isPaired = partnerIds.has(device.device_id);
                      const isOnline = device.status === 'online';

                      return (
                        <div key={device.device_id}
                          onClick={() => {
                            if (!isOnline && !isPaired) return;
                            if (isPaired) handleSyncWith(device.device_id);
                            else preparePairing(device.device_id, device.display_name);
                          }}
                          className={`group relative flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all duration-200 ${activePartnerId === device.device_id
                            ? 'border-[var(--kk-ember)] bg-[var(--kk-ember)]/5 shadow-md'
                            : isPaired
                              ? 'border-[var(--kk-sage)]/30 bg-[var(--kk-sage-bg)] hover:border-[var(--kk-sage)]/50'
                              : 'border-transparent bg-[var(--kk-paper)] hover:border-[var(--kk-smoke-heavy)] hover:bg-[var(--kk-cream)]'
                            }`}
                          style={{ animationDelay: `${idx * 50}ms` }}
                        >
                          <div className="relative">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold ${isPaired
                              ? 'bg-gradient-to-br from-[var(--kk-sage)] to-[var(--kk-forest)] text-white shadow-md'
                              : 'bg-[var(--kk-cream)] text-[var(--kk-ink)]'
                              }`}>
                              {device.display_name.charAt(0).toUpperCase()}
                            </div>
                            <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${isOnline ? 'bg-[var(--kk-sage)] shadow-[0_0_4px_var(--kk-sage)]' : 'bg-[var(--kk-ash)]'
                              }`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--kk-ink)]">{device.display_name}</span>
                              {isPaired && (
                                <span className="rounded-full bg-[var(--kk-sage-bg)] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-[var(--kk-sage)]">Paired</span>
                              )}
                            </div>
                            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--kk-ash)]">
                              {isPaired ? (isOnline ? 'Tap to sync' : 'Offline') : isOnline ? 'Tap to pair' : 'Offline'}
                            </div>
                          </div>
                          {isPaired ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleForgetPartner(device.device_id); }}
                              className="rounded-lg p-2 text-[var(--kk-ash)] opacity-0 transition-all hover:bg-[var(--kk-danger-bg)] hover:text-[var(--kk-danger)] group-hover:opacity-100"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          ) : (
                            <ChevronRight className="h-4 w-4 text-[var(--kk-ash)] opacity-0 transition-opacity group-hover:opacity-100" />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Active Tasks & Ledger (8 cols) */}
        <div className="space-y-5 lg:col-span-8">

          {/* PAIRING REQUESTS (High Emphasis) */}
          {incomingPair && (
            <div className="kk-card-emphasis overflow-hidden rounded-2xl p-0 animate-fade-up">
              <div className="bg-[var(--kk-ember)] px-5 py-3 text-white">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-white/20 p-2"><Users className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">New pairing request</h3>
                    <p className="text-xs opacity-90">From {incomingPair.from_display_name}</p>
                  </div>
                </div>
              </div>
              <div className="p-5">
                <p className="mb-4 text-sm text-[var(--kk-ash)]">Enter the 4-digit code shown on their screen to verify and connect.</p>
                <div className="flex flex-wrap items-center gap-4">
                  <input
                    value={incomingCode}
                    onChange={(e) => setIncomingCode(e.target.value)}
                    placeholder="0000"
                    maxLength={4}
                    className="w-32 rounded-xl border-2 border-[var(--kk-smoke-heavy)] px-4 py-3 text-center text-2xl font-bold tracking-[0.5em] text-[var(--kk-ink)] focus:border-[var(--kk-ember)] focus:outline-none"
                  />
                  <button onClick={handleIncomingPairAccept} className="kk-btn-primary">
                    Verify & connect <ArrowRight className="ml-2 h-4 w-4" />
                  </button>
                  <button onClick={handleIncomingPairCancel} className="kk-btn-ghost text-xs">
                    Not now
                  </button>
                </div>
              </div>
            </div>
          )}

          {outgoingPair && (
            <div className="kk-card border-[var(--kk-ember)] p-5 text-center animate-fade-up">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--kk-cream)] text-[var(--kk-ember)]">
                <Shield className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-[var(--kk-ink)]">Pairing with {outgoingPair.to_display_name}</h3>
              <p className="mx-auto mt-2 max-w-xs text-sm text-[var(--kk-ash)]">
                Ask them to type this code to confirm the secure link.
              </p>
              <div className="my-6 flex justify-center gap-3">
                {outgoingPair.code.split('').map((digit, i) => (
                  <div key={i} className="flex h-16 w-12 items-center justify-center rounded-xl bg-[var(--kk-ink)] text-3xl font-bold text-white shadow-lg">
                    {digit}
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  const timestamp = new Date().toISOString();

                  const toDeviceId = pairingKeyRef.current?.to_device_id;
                  const sessionId = pairingKeyRef.current?.session_id;
                  const fromDeviceId = identityRef.current?.device_id;
                  const fromDisplayName = identityRef.current?.display_name;

                  setOutgoingPair(null);
                  pairingKeyRef.current = null;

                  if (toDeviceId && sessionId && identityRef.current) {
                    try {

                      const client = await connectSignaling();
                      client.send("pairing:cancel", {
                        session_id: sessionId,
                        to_device_id: toDeviceId,
                        from_device_id: fromDeviceId,
                        from_display_name: fromDisplayName,
                      });

                    } catch (error) {

                    }
                  } else {

                  }
                }}
                className="kk-btn-ghost text-xs"
              >
                Cancel request
              </button>
            </div>
          )}

          {/* CONFLICTS */}
          {showConflicts && conflictIds.length > 0 && (
            <div className="kk-card-warning rounded-xl p-4 animate-fade-up">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                  <div>
                    <div className="font-bold text-amber-900">{conflictIds.length} sync conflict{conflictIds.length > 1 ? 's' : ''}</div>
                    <div className="text-xs text-amber-700">Pick which version should stay in your ledger.</div>
                  </div>
                </div>
                <button onClick={() => setShowConflicts(!showConflicts)} className="kk-btn-secondary text-xs h-8">
                  {showConflicts ? "Hide" : "Review"}
                </button>
              </div>

              {showConflicts && (
                <div className="mt-4 space-y-2 border-t border-amber-200/50 pt-4">
                  {conflictIds.map(id => (
                    <div key={id}
                      onClick={() => setSelectedConflict(id)}
                      className={`flex cursor-pointer items-center justify-between rounded-lg bg-white/60 p-3 transition-colors hover:bg-white ${selectedConflict === id ? 'ring-2 ring-amber-400' : ''}`}
                    >
                      <span className="font-mono text-xs text-[var(--kk-ash)]">{id.slice(0, 8)}...</span>
                      <span className="text-xs font-bold text-amber-700">Resolve &rarr;</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* CONFLICT RESOLUTION MODAL/CARD */}
          {selectedConflict && conflictVersions.length >= 2 && (
            <div className="kk-card p-5 animate-fade-up ring-4 ring-amber-100">
              <h3 className="mb-4 font-bold text-lg flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-[var(--kk-ember)]" />
                Choose the version to keep
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {conflictVersions.map((version, i) => (
                  <div key={i} className="rounded-xl border border-[var(--kk-smoke-heavy)] p-4 hover:border-[var(--kk-ember)] transition-colors bg-white">
                    <div className="mb-3 flex justify-between items-start">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${i === 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                        {i === 0 ? 'Most Recent' : 'Older'}
                      </span>
                      <span className="text-xs text-[var(--kk-ash)]">
                        {new Date(version.updatedAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="font-medium text-lg mb-1">{version.snapshot.item}</div>
                    <div className="font-mono font-bold text-xl text-[var(--kk-ember)]">₹{formatCurrency(version.snapshot.amount)}</div>
                    <div className="mt-4 text-xs text-[var(--kk-ash)] mb-3">
                      Edited by {version.editorId === identity?.device_id ? "You" : partnerNameById.get(version.editorId) || "Partner"}
                    </div>
                    <button onClick={() => handleResolveConflict(version.snapshot)} className="w-full kk-btn-secondary text-xs">
                      Keep This Version
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PROGRESS BAR (Floating) */}
          {syncProgress && (
            <div className="rounded-xl bg-[var(--kk-ink)] p-4 text-white shadow-lg animate-fade-up">
              <div className="mb-2 flex justify-between text-xs font-medium opacity-80">
                <span>Sync in progress</span>
                <span>{Math.round((syncProgress.current / syncProgress.total) * 100)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
                <div className="h-full bg-[var(--kk-ember)] transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
              <div className="mt-2 text-[10px] opacity-60">
                Chunk {syncProgress.chunks.current} of {syncProgress.chunks.total}
              </div>
            </div>
          )}

          {/* MONTHLY PULSE (Summary Card) */}
          <div className="overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white p-6 shadow-md">
            <div>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <div className="rounded-lg bg-[var(--kk-ember)]/10 p-1.5">
                      <TrendingUp className="h-4 w-4 text-[var(--kk-ember)]" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--kk-ash)]">Month to date</span>
                  </div>
                  <div className="text-3xl font-bold text-[var(--kk-ink)]">
                    <span className="text-[var(--kk-ash)]">₹</span>{formatCurrency(totals.total)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--kk-ash)]">Split</div>
                  <div className="mt-1 text-lg font-bold text-[var(--kk-ink)]">{Math.round(totals.youPct)}:{Math.round(100 - totals.youPct)}</div>
                </div>
              </div>

              {/* Enhanced Split Bar */}
              <div className="mb-3 flex h-3.5 w-full overflow-hidden rounded-full bg-[var(--kk-smoke-heavy)]">
                <div className="h-full bg-gradient-to-r from-[var(--kk-ocean)] to-[#5b7dea] transition-all duration-700 ease-out" style={{ width: `${totals.youPct}%` }} />
                <div className="h-full bg-gradient-to-r from-[var(--kk-ember)] to-[var(--kk-saffron)] transition-all duration-700 ease-out" style={{ width: `${100 - totals.youPct}%` }} />
              </div>

              <div className="flex justify-between text-xs">
                <span className="flex items-center gap-2 text-[var(--kk-ink)]">
                  <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-[var(--kk-ocean)] to-[#5b7dea] shadow-sm" />
                  <span className="font-medium">You</span>
                  <span className="font-mono text-[var(--kk-ash)]">₹{formatCurrency(totals.you)}</span>
                </span>
                <span className="flex items-center gap-2 text-[var(--kk-ink)]">
                  <span className="font-mono text-[var(--kk-ash)]">₹{formatCurrency(totals.partner)}</span>
                  <span className="font-medium">Partner</span>
                  <div className="h-2.5 w-2.5 rounded-full bg-gradient-to-r from-[var(--kk-ember)] to-[var(--kk-saffron)] shadow-sm" />
                </span>
              </div>
            </div>
          </div>

          {/* HOUSEHOLD LEDGER - Premium Redesign */}
          <div className="overflow-hidden rounded-2xl border border-[var(--kk-smoke)] bg-white shadow-xl">
            {/* Header with gradient accent */}
            <div className="relative overflow-hidden border-b border-[var(--kk-smoke)] bg-gradient-to-r from-white via-white to-[var(--kk-cream)] px-6 py-5">
              <div className="absolute -right-4 top-0 h-full w-32 bg-gradient-to-l from-[var(--kk-ember)]/5 to-transparent" />

              <div className="relative z-10 sm:flex sm:items-center sm:justify-between">
                <div className="mb-4 flex items-center gap-3 sm:mb-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--kk-ember)] to-[var(--kk-ember-deep)] text-white shadow-lg shadow-[var(--kk-ember)]/20">
                    <Shield className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-[var(--kk-ink)]">Shared Ledger</div>
                    <div className="text-xs text-[var(--kk-ash)]">
                      {viewMode === 'recent' ? "Recent shared activity" : `${filteredTransactions.length} shared entries`}
                    </div>
                  </div>
                </div>

                {/* Filter Controls - Enhanced */}
                <div className="flex rounded-xl border border-[var(--kk-smoke)] bg-[var(--kk-paper)] p-1">
                  {(["all", "you", "partner"] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setHouseholdFilter(filter)}
                      className={`rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all ${householdFilter === filter
                        ? 'bg-gradient-to-r from-[var(--kk-ember)] to-[var(--kk-ember-deep)] text-white shadow-md'
                        : 'text-[var(--kk-ash)] hover:bg-white hover:text-[var(--kk-ink)]'
                        }`}
                    >
                      {filter === "all" ? "All" : filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              {filteredTransactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="relative mb-6">
                    <div className="absolute inset-0 rounded-full bg-[var(--kk-ember)]/10 blur-xl" />
                    <div className="relative rounded-2xl bg-gradient-to-br from-[var(--kk-paper)] to-[var(--kk-cream)] p-5 shadow-lg">
                      <Clock className="h-10 w-10 text-[var(--kk-ash)]" />
                    </div>
                  </div>
                  <h4 className="text-lg font-bold text-[var(--kk-ink)]">No shared activity yet</h4>
                  <p className="mt-2 max-w-xs text-sm text-[var(--kk-ash)]">
                    {viewMode === 'recent' ? "Sync with a paired device to see shared transactions here." : "Try a different filter to find entries."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-1 p-4">
                    {filteredTransactions.map((tx, index) => {
                      const ownerLabel = tx.owner_device_id === identity?.device_id
                        ? "You"
                        : partnerNameById.get(tx.owner_device_id || "") || "Partner";

                      return (
                        <TransactionRow
                          key={`${tx.id}-${index}`}
                          tx={tx}
                          index={index}
                          metaVariant="date"
                          hasEdit={false}
                          onDelete={() => undefined}
                          onOpenMobileSheet={() => undefined}
                          formatCurrency={formatCurrency}
                          ownerLabel={ownerLabel}
                          showActions={false}
                        />
                      );
                    })}
                  </div>

                  {/* View All Button (Only in Recent Mode) */}
                  {viewMode === 'recent' && householdTransactions.length > 5 && (
                    <div className="border-t border-[var(--kk-smoke)] bg-[var(--kk-paper)] px-4 py-4">
                      <button
                        onClick={() => setViewMode('full')}
                        className="group w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--kk-smoke-heavy)] bg-white p-4 text-sm font-semibold text-[var(--kk-ink)] transition-all hover:border-[var(--kk-ember)] hover:bg-[var(--kk-ember)]/5"
                      >
                        View all {householdTransactions.length} entries
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </button>
                    </div>
                  )}

                  {/* Show Less Button (Only in Full Mode) */}
                  {viewMode === 'full' && (
                    <div className="border-t border-[var(--kk-smoke)] px-4 py-4">
                      <button
                        onClick={() => setViewMode('recent')}
                        className="w-full flex items-center justify-center gap-2 rounded-xl p-3 text-sm font-semibold text-[var(--kk-ash)] transition-colors hover:text-[var(--kk-ink)]"
                      >
                        Show recent only
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
