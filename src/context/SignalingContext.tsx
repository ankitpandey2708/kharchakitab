"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { SIGNALING_URL } from "@/src/config/sync";
import { SignalingClient } from "@/src/services/sync/signalingClient";
import { getDeviceIdentity } from "@/src/db/db";
import { useNavigation } from "./NavigationContext";
import { usePairing } from "./PairingContext";

interface SignalingContextValue {
    client: SignalingClient | null;
    isConnected: boolean;
    error: string | null;
    reconnect: () => Promise<void>;
    disconnect: () => void;
    refreshPresence: (displayName?: string) => Promise<void>;
}

const SignalingContext = createContext<SignalingContextValue | null>(null);

export const SignalingProvider = ({ children }: { children: React.ReactNode }) => {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const clientRef = useRef<SignalingClient | null>(null);
    const intervalRef = useRef<number | null>(null);

    const { setActiveTab } = useNavigation();
    const { setIncomingPair } = usePairing();
    const navRef = useRef({ setActiveTab });
    const pairingRef = useRef({ setIncomingPair });

    useEffect(() => {
        navRef.current = { setActiveTab };
        pairingRef.current = { setIncomingPair };
    }, [setActiveTab, setIncomingPair]);

    const joinPresence = useCallback(async (client: SignalingClient, displayName?: string) => {
        const identity = await getDeviceIdentity();
        if (!identity) {
            console.warn("[Signaling] No identity found, cannot join presence");
            return;
        }
        client.send("presence:join", {
            device_id: identity.device_id,
            display_name: displayName ?? identity.display_name,
        });
    }, []);

    const refreshPresence = useCallback(async (displayName?: string) => {
        if (!clientRef.current || !clientRef.current.isConnected()) {
            console.log("[Signaling] Cannot refresh presence - not connected");
            return;
        }
        console.log("[Signaling] Refreshing presence with updated identity");
        await joinPresence(clientRef.current, displayName);
    }, [joinPresence]);

    const connect = useCallback(async () => {
        if (clientRef.current) {
            console.log("[Signaling] Already have client, skipping connect");
            return;
        }
        setError(null);
        try {
            console.log("[Signaling] Starting connection to:", SIGNALING_URL);
            const identity = await getDeviceIdentity();
            if (!identity) {
                console.warn("[Signaling] No identity found, cannot connect");
                return;
            }

            const client = new SignalingClient(SIGNALING_URL);

            const joinPresenceLocal = () => {
                client.send("presence:join", {
                    device_id: identity.device_id,
                    display_name: identity.display_name,
                });
            };

            const startHeartbeat = () => {
                if (intervalRef.current) window.clearInterval(intervalRef.current);
                intervalRef.current = window.setInterval(() => {
                    if (client.isConnected()) {
                        client.send("presence:ping", { device_id: identity.device_id });
                    }
                }, 20000);
            };

            // REGISTER GLOBAL LISTENERS (Before connect)
            client.on("pairing:request", async (payload) => {
                const timestamp = new Date().toISOString();
                console.log(`[${timestamp}] [Pairing] Received pairing:request:`, payload);
                if (!payload) return;

                const device = await getDeviceIdentity();
                if (payload.to_device_id !== device?.device_id) {
                    console.log(`[${timestamp}] [Pairing] Request not for us. Target: ${payload.to_device_id}, Us: ${device?.device_id}`);
                    return;
                }

                console.log(`[${timestamp}] [Pairing] Request is for us! Display name: ${payload.from_display_name}`);
                pairingRef.current.setIncomingPair({
                    session_id: payload.session_id,
                    from_device_id: payload.from_device_id,
                    from_display_name: payload.from_display_name,
                });

            });

            client.on("pairing:cancel", (payload) => {
                const timestamp = new Date().toISOString();
                console.log(`[${timestamp}] [Pairing] Received pairing:cancel:`, payload);
                pairingRef.current.setIncomingPair(null);
            });

            client.on("error", (payload) => {
                console.error("[Signaling] Server error:", payload);
                setError(payload?.message ?? "Signaling error");
            });

            client.on("disconnected", () => {
                console.log("[Signaling] Connection lost, waiting to reconnect...");
                setIsConnected(false);
            });

            client.on("reconnected", () => {
                console.log("[Signaling] Reconnected, re-joining presence");
                joinPresenceLocal();
                startHeartbeat();
                setIsConnected(true);
                setError(null);
            });

            await client.connect();
            clientRef.current = client;

            joinPresenceLocal();
            startHeartbeat();

            console.log("[Signaling] Connection successful, joined presence");
            setIsConnected(true);
        } catch (err) {
            console.error("[Signaling] Connection failed:", err);
            setError(err instanceof Error ? err.message : "Failed to connect to signaling server");
        }
    }, []);

    const disconnect = useCallback(() => {
        console.log("[Signaling] Manually disconnecting client");
        if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
        if (clientRef.current) {
            clientRef.current.disconnect();
            clientRef.current = null;
        }
        setIsConnected(false);
    }, []);

    useEffect(() => {
        connect();
        return () => {
            console.log("[Signaling] Provider unmounting, cleaning up");
            if (intervalRef.current) {
                window.clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
            clientRef.current?.disconnect();
            clientRef.current = null;
            setIsConnected(false);
        };
    }, [connect]);

    const [client, setClient] = useState<SignalingClient | null>(null);

    // Keep client state in sync with ref after connect/disconnect
    useEffect(() => {
        console.log(`[Signaling] Syncing client state. isConnected: ${isConnected}, hasClient: ${!!clientRef.current}`);
        setClient(clientRef.current);
    }, [isConnected]);

    const value = useMemo<SignalingContextValue>(
        () => ({ client, isConnected, error, reconnect: connect, disconnect, refreshPresence }),
        [client, isConnected, error, connect, disconnect, refreshPresence]
    );

    return (
        <SignalingContext.Provider value={value}>
            {children}
        </SignalingContext.Provider>
    );
};

const NOOP_VALUE: SignalingContextValue = {
    client: null,
    isConnected: false,
    error: null,
    reconnect: async () => { },
    disconnect: () => { },
    refreshPresence: async () => { },
};

export const useSignaling = (): SignalingContextValue => {
    const ctx = useContext(SignalingContext);
    return ctx ?? NOOP_VALUE;
};
