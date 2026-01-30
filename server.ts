import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT || 7071;
const PRESENCE_TTL_MS = 60 * 1000; // 60 seconds for presence
const PAIRING_TTL_MS = 5 * 60 * 1000; // S6.T6: 5 minutes for pairing sessions

const server = createServer((req, res) => {
  // Handle basic health checks for Render/Uptime services
  res.writeHead(200);
  res.end("OK");
});
const wss = new WebSocketServer({ server });

interface Client {
  ws: WebSocket;
  device_id: string;
  display_name: string;
  lastSeen: number;
  ip: string;
}

interface PairingSession {
  created_at: number;
  from_device_id: string;
  to_device_id: string;
}

const clients = new Map<string, Client>();
const pairingSessions = new Map<string, PairingSession>(); // S6.T6: session_id -> { created_at, from_device_id, to_device_id }

const normalizeIp = (ip: string | undefined): string => {
  if (!ip) return "unknown";
  if (ip === "::1") return "127.0.0.1";
  if (ip.startsWith("::ffff:")) return ip.slice(7);
  return ip;
};

const sendMessage = (ws: WebSocket, type: string, payload: any, request_id?: string) => {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type, payload, request_id }));
};

const pruneStaleClients = () => {
  const now = Date.now();
  for (const [deviceId, client] of clients.entries()) {
    if (now - client.lastSeen > PRESENCE_TTL_MS) {
      clients.delete(deviceId);
      try {
        client.ws.close();
      } catch {
        // ignore
      }
    }
  }
};

// S6.T6: Clean up expired pairing sessions
const pruneExpiredPairingSessions = () => {
  const now = Date.now();
  for (const [sessionId, session] of pairingSessions.entries()) {
    if (now - session.created_at > PAIRING_TTL_MS) {
      pairingSessions.delete(sessionId);
    }
  }
};

setInterval(pruneStaleClients, 15 * 1000);
setInterval(pruneExpiredPairingSessions, 30 * 1000); // S6.T6: Check every 30 seconds

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  const ip = normalizeIp(req.socket.remoteAddress || "");
  console.log(`[Server] New connection from ${ip}`);

  ws.on("message", (raw: string | Buffer) => {
    let message: any;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || !message.type) return;

    const { type, payload, request_id } = message;
    console.log(`[Server] Message received: ${type} from IP: ${ip}`);

    if (type === "presence:join") {
      const deviceId = payload?.device_id;
      if (!deviceId) return;
      clients.set(deviceId, {
        ws,
        device_id: deviceId,
        display_name: payload?.display_name || "Unknown",
        lastSeen: Date.now(),
        ip,
      });
      console.log(`[Server] Device joined: ${payload?.display_name} (${deviceId})`);
      sendMessage(ws, "presence:ack", { ok: true }, request_id);
      return;
    }

    if (type === "presence:ping") {
      const deviceId = payload?.device_id;
      const client = clients.get(deviceId);
      if (client) {
        client.lastSeen = Date.now();
      }
      return;
    }

    if (type === "presence:list") {
      const deviceId = payload?.device_id;
      const requester = clients.get(deviceId);
      const requesterIp = requester?.ip || ip;
      console.log(`[Server] Listing devices for ${deviceId} at ${requesterIp}`);

      const list = Array.from(clients.values())
        .filter((client) => client.ws.readyState === WebSocket.OPEN)
        .filter((client) => {
          const match = requesterIp ? client.ip === requesterIp : true;
          if (!match) {
            console.log(`[Server] Filtering out ${client.display_name} (${client.ip} !== ${requesterIp})`);
          }
          return match;
        })
        .map((client) => ({
          device_id: client.device_id,
          display_name: client.display_name,
        }));
      sendMessage(ws, "presence:list", list, request_id);
      return;
    }

    // S6.T6: Handle pairing:request - create session with TTL
    if (type === "pairing:request") {
      const timestamp = new Date().toISOString();
      const sessionId = payload?.session_id;
      const fromDeviceId = payload?.from_device_id;
      const toDeviceId = payload?.to_device_id;
      const fromDisplayName = payload?.from_display_name;

      console.log(`[Server] ${timestamp} PAIRING_REQUEST_RECEIVED: session=${sessionId} from=${fromDeviceId}(${fromDisplayName}) to=${toDeviceId}`);

      if (!sessionId || !fromDeviceId || !toDeviceId) {
        console.warn(`[Server] ${timestamp} PAIRING_REQUEST_INVALID: Missing required fields`);
        sendMessage(ws, "error", { message: "Invalid pairing request" }, request_id);
        return;
      }

      // Create pairing session with timestamp
      pairingSessions.set(sessionId, {
        created_at: Date.now(),
        from_device_id: fromDeviceId,
        to_device_id: toDeviceId,
      });
      console.log(`[Server] ${timestamp} PAIRING_SESSION_CREATED: ${sessionId} (TTL: 5 min)`);

      // Forward to target device
      const target = clients.get(toDeviceId);
      console.log(`[Server] ${timestamp} PAIRING_REQUEST_FORWARDING: target=${toDeviceId} connected=${!!target}`);

      if (target) {
        console.log(`[Server] ${timestamp} PAIRING_REQUEST_SENT: Sending to ${toDeviceId}`);
        sendMessage(target.ws, type, payload, request_id);
      } else {
        console.warn(`[Server] ${timestamp} PAIRING_REQUEST_FAILED: Target ${toDeviceId} not connected`);
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    // S6.T6: Handle pairing:accept - validate TTL
    if (type === "pairing:accept") {
      const sessionId = payload?.session_id;
      const toDeviceId = payload?.to_device_id;

      if (!sessionId || !toDeviceId) {
        sendMessage(ws, "error", { message: "Invalid pairing accept" }, request_id);
        return;
      }

      // Check if session exists
      const session = pairingSessions.get(sessionId);
      if (!session) {
        sendMessage(ws, "error", { message: "Pairing session not found or expired" }, request_id);
        return;
      }

      // S6.T6: Validate TTL
      const now = Date.now();
      if (now - session.created_at > PAIRING_TTL_MS) {
        pairingSessions.delete(sessionId);
        sendMessage(ws, "error", {
          message: "Pairing code expired. Please start pairing again.",
          code: "PAIRING_EXPIRED"
        }, request_id);
        return;
      }

      // Forward to target
      const target = clients.get(toDeviceId);
      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      } else {
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    // S6.T6: Handle pairing:confirm - validate TTL and cleanup on success
    if (type === "pairing:confirm") {
      const sessionId = payload?.session_id;
      const toDeviceId = payload?.to_device_id;

      if (!sessionId || !toDeviceId) {
        sendMessage(ws, "error", { message: "Invalid pairing confirm" }, request_id);
        return;
      }

      // Check session
      const session = pairingSessions.get(sessionId);
      if (!session) {
        sendMessage(ws, "error", { message: "Pairing session not found or expired" }, request_id);
        return;
      }

      // Validate TTL
      const now = Date.now();
      if (now - session.created_at > PAIRING_TTL_MS) {
        pairingSessions.delete(sessionId);
        sendMessage(ws, "error", {
          message: "Pairing code expired. Please start pairing again.",
          code: "PAIRING_EXPIRED"
        }, request_id);
        return;
      }

      // Forward to target
      const target = clients.get(toDeviceId);
      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      } else {
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    // Handle pairing:cancel - cancel an active pairing request
    if (type === "pairing:cancel") {
      const sessionId = payload?.session_id;
      const toDeviceId = payload?.to_device_id;
      const fromDeviceId = payload?.from_device_id;
      const fromDisplayName = payload?.from_display_name;
      const timestamp = new Date().toISOString();

      console.log(`[Server] ${timestamp} PAIRING_CANCEL_RECEIVED: from=${fromDeviceId} (${fromDisplayName}) to=${toDeviceId} session=${sessionId}`);

      if (!sessionId || !toDeviceId) {
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_INVALID: Missing sessionId or toDeviceId`);
        sendMessage(ws, "error", { message: "Invalid pairing cancel" }, request_id);
        return;
      }

      // Check if session exists
      const session = pairingSessions.get(sessionId);
      if (!session) {
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_SESSION_NOT_FOUND: sessionId=${sessionId} not found or already expired`);
        // Still try to forward in case client needs to clear state
      } else {
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_SESSION_FOUND: session created_at=${new Date(session.created_at).toISOString()}`);
      }

      // Forward to target device
      const target = clients.get(toDeviceId);
      if (target) {
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_FORWARDING: Forwarding to target device ${toDeviceId}`);
        sendMessage(target.ws, type, payload, request_id);
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_FORWARDED: Successfully forwarded pairing:cancel to ${toDeviceId}`);
      } else {
        console.warn(`[Server] ${timestamp} PAIRING_CANCEL_TARGET_OFFLINE: Target device ${toDeviceId} not connected`);
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }

      // Clean up the session since it was cancelled
      if (session) {
        console.log(`[Server] ${timestamp} PAIRING_CANCEL_CLEANUP: Deleting session ${sessionId}`);
        pairingSessions.delete(sessionId);
      }
      return;
    }

    // Handle pairing:reject - forward failure/retry status
    if (type === "pairing:reject") {
      const sessionId = payload?.session_id;
      const toDeviceId = payload?.to_device_id;

      if (!sessionId || !toDeviceId) {
        sendMessage(ws, "error", { message: "Invalid pairing reject" }, request_id);
        return;
      }

      // Check session existence (optional, but good practice)
      const session = pairingSessions.get(sessionId);
      if (!session) {
        // Session might have expired already, just ignore or notify?
        // We'll proceed to try forwarding in case it helps clear client state
      }

      // Forward to target
      const target = clients.get(toDeviceId);
      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      }

      // If the rejection is terminal (e.g. max attempts), we could delete the session here.
      // But we'll rely on the client to stop and the server's TTL to clean up.
      // Or we can check a flag:
      if (payload?.final || payload?.reason === "cancelled") {
        console.log(`[Pairs] Pairing rejected with reason=${payload?.reason}, deleting session ${sessionId}`);
        pairingSessions.delete(sessionId);
      }
      return;
    }

    // S6.T6: Handle pairing:confirm-response - cleanup session on completion
    if (type === "pairing:confirm-response") {
      const sessionId = payload?.session_id;
      const toDeviceId = payload?.to_device_id;

      if (!sessionId || !toDeviceId) {
        sendMessage(ws, "error", { message: "Invalid pairing confirm response" }, request_id);
        return;
      }

      // Forward to target
      const target = clients.get(toDeviceId);
      if (target) {
        console.log(`[Pairs] Forwarding ${type} to ${toDeviceId}`);
        sendMessage(target.ws, type, payload, request_id);
      } else {
        console.warn(`[Pairs] Forward failed: ${toDeviceId} not connected`);
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }

      // S6.T6: Session complete - remove to prevent reuse
      console.log(`[Pairs] Session complete: ${sessionId}`);
      pairingSessions.delete(sessionId);
      return;
    }

    // Forward WebRTC messages (no TTL needed - these happen after pairing)
    if (
      type === "webrtc:offer" ||
      type === "webrtc:answer" ||
      type === "webrtc:candidate"
    ) {
      const targetId = payload?.to_device_id;
      const target = clients.get(targetId);
      console.log(`[WebRTC] Forwarding ${type} to ${targetId}`);
      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      } else {
        console.warn(`[WebRTC] Forward failed: ${targetId} offline`);
        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }
  });

  ws.on("close", () => {
    for (const [deviceId, client] of clients.entries()) {
      if (client.ws === ws) {
        console.log(`[Server] Device disconnected: ${client.display_name} (${deviceId})`);
        clients.delete(deviceId);
      }
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Signaling server listening on :${PORT}`);
});
