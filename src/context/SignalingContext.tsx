"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
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
            console.log('[SignalingProvider] Connecting to signaling server...');
            const device = await getDeviceIdentity();
            if (!device) {
                console.log('[SignalingProvider] No device identity found');
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
            console.log('[SignalingProvider] Registered as', device.display_name);

            // Heartbeat every 20 seconds
            intervalRef.current = window.setInterval(() => {
                if (client.isConnected()) {
                    client.send("presence:ping", { device_id: device.device_id });
                }
            }, 20000);

            setIsConnected(true);
            setError(null);
        } catch (err) {
            console.log('[SignalingProvider] Connection failed:', err);
            setIsConnected(false);
            setError(err instanceof Error ? err.message : "Failed to connect");
        }
    }, []);

    const disconnect = useCallback(() => {
        console.log('[SignalingProvider] Disconnecting...');
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

    return (
        <SignalingContext.Provider value={{ client: clientRef.current, isConnected, error, reconnect: connect, disconnect }}>
            {children}
        </SignalingContext.Provider>
    );
};

export const useSignaling = () => {
    const ctx = useContext(SignalingContext);
    if (!ctx) {
        throw new Error("useSignaling must be used within a SignalingProvider");
    }
    return ctx;
};
