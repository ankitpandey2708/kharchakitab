"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from "react";
import { SIGNALING_URL } from "@/src/config/sync";
import { SignalingClient } from "@/src/services/sync/signalingClient";
import { getDeviceIdentity } from "@/src/db/db";

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

    const connect = useCallback(async () => {
        try {

            const device = await getDeviceIdentity();
            if (!device) {

                return;
            }

            // Create a single shared signaling client
            const client = new SignalingClient(SIGNALING_URL);
            await client.connect();
            clientRef.current = client;

            // Register presence
            client.send("presence:join", {
                device_id: device.device_id,
                display_name: device.display_name,
            });


            // Heartbeat every 20 seconds
            intervalRef.current = window.setInterval(() => {
                if (client.isConnected()) {
                    client.send("presence:ping", { device_id: device.device_id });
                }
            }, 20000);

            setIsConnected(true);
            setError(null);
        } catch (err) {

            setIsConnected(false);
            setError(err instanceof Error ? err.message : "Failed to connect");
        }
    }, []);

    const disconnect = useCallback(() => {

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
            disconnect();
        };
    }, [connect, disconnect]);

    const [client, setClient] = useState<SignalingClient | null>(null);

    // Keep client state in sync with ref after connect/disconnect
    useEffect(() => {
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
