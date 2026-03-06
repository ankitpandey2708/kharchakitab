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

            // REGISTER GLOBAL LISTENERS IMMEDIATELY (Before connect)
            console.log("[Signaling] Registering global pairing listeners on new client");

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

                // Auto-switch to Household tab
                console.log(`[${timestamp}] [Pairing] Auto-switching to household tab`);
                navRef.current.setActiveTab("household");
            });

            client.on("pairing:cancel", (payload) => {
                const timestamp = new Date().toISOString();
                console.log(`[${timestamp}] [Pairing] Received pairing:cancel:`, payload);
                pairingRef.current.setIncomingPair(null);
            });

            await client.connect();

            clientRef.current = client;

            // Register presence
            client.send("presence:join", {
                device_id: identity.device_id,
                display_name: identity.display_name,
            });

            // Heartbeat every 20 seconds
            if (intervalRef.current) window.clearInterval(intervalRef.current);
            intervalRef.current = window.setInterval(() => {
                if (client.isConnected()) {
                    client.send("presence:ping", { device_id: identity.device_id });
                }
            }, 20000);

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
        () => ({ client, isConnected, error, reconnect: connect, disconnect }),
        [client, isConnected, error, connect, disconnect]
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
};

export const useSignaling = (): SignalingContextValue => {
    const ctx = useContext(SignalingContext);
    return ctx ?? NOOP_VALUE;
};
