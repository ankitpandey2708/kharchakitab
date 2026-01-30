"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getDeviceIdentity } from "@/src/db/db";
import { SIGNALING_URL } from "@/src/config/sync";
import { SignalingClient } from "@/src/services/sync/signalingClient";

export const usePresence = () => {
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const clientRef = useRef<SignalingClient | null>(null);
    const intervalRef = useRef<number | null>(null);

    const connect = useCallback(async () => {
        try {
            console.log('[usePresence] Connecting to signaling server...');
            const device = await getDeviceIdentity();
            if (!device) {
                console.log('[usePresence] No device identity found');
                return;
            }

            const client = new SignalingClient(SIGNALING_URL);
            await client.connect();
            clientRef.current = client;

            // Register presence
            client.send("presence:join", {
                device_id: device.device_id,
                display_name: device.display_name,
            });
            console.log('[usePresence] Registered as', device.display_name);

            // Heartbeat every 20 seconds
            intervalRef.current = window.setInterval(() => {
                if (client.isConnected()) {
                    client.send("presence:ping", { device_id: device.device_id });
                }
            }, 20000);

            setIsConnected(true);
        } catch (err) {
            console.log('[usePresence] Connection failed:', err);
            setError(err instanceof Error ? err.message : "Failed to connect");
        }
    }, []);

    const disconnect = useCallback(() => {
        console.log('[usePresence] Disconnecting...');
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

    return {
        isConnected,
        error,
        client: clientRef.current,
        reconnect: connect,
        disconnect,
    };
};
