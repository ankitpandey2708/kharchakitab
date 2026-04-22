import "dotenv/config";
import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { run as runPreflight } from "./scripts/preflight-render";

const PORT = process.env.PORT || 7071;

const PRESENCE_TTL_MS = 60 * 1000; // 60 seconds for presence
const PAIRING_TTL_MS = 5 * 60 * 1000; // S6.T6: 5 minutes for pairing sessions

const server = createServer((_req, res) => {
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

// ── Sarvam STT WebSocket proxy ──
// Browser WebSocket API cannot send custom headers. Sarvam requires
// Api-Subscription-Key as a header. So we proxy: client → server.ts → Sarvam.
// This is a local hop (same infra), not an external network hop.
const SARVAM_WS_BASE = "wss://api.sarvam.ai/speech-to-text-translate/ws";
const SARVAM_KEY = process.env.SARVAM_KEY || "";

function setupSarvamProxy(clientWs: WebSocket, config: Record<string, string>) {
  const params = new URLSearchParams({
    model: config.model || "saaras:v3",
    mode: config.mode || "translate",
    sample_rate: config.sample_rate || "16000",
    vad_signals: "true",
    high_vad_sensitivity: "true",
    flush_signal: "true",
    input_audio_codec: config.input_audio_codec || "pcm_s16le",
  });

  const sarvamWs = new WebSocket(`${SARVAM_WS_BASE}?${params}`, {
    headers: { "api-subscription-key": SARVAM_KEY },
  });

  sarvamWs.on("open", () => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "stt:ready" }));
    }
  });

  sarvamWs.on("message", (data: Buffer | string) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(String(data));
    }
  });

  sarvamWs.on("error", (err: Error) => {
    console.error("[SarvamProxy] Upstream error:", err.message);
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "error", data: { error: "Sarvam connection failed: " + err.message } }));
    }
  });

  sarvamWs.on("close", (code: number, reason: Buffer) => {
    console.log("[SarvamProxy] Upstream closed:", code, reason.toString());
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: "stt:closed" }));
    }
  });

  // Relay client → Sarvam (audio chunks, flush, config)
  const forwardToSarvam = (raw: string | Buffer) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.type?.startsWith("stt:") || msg.type?.startsWith("presence:") || msg.type?.startsWith("pairing:") || msg.type?.startsWith("webrtc:")) return;
    if (sarvamWs.readyState === WebSocket.OPEN) {
      sarvamWs.send(String(raw));
    }
  };

  clientWs.on("message", forwardToSarvam);

  const cleanupProxy = () => {
    clientWs.removeListener("message", forwardToSarvam);
    if (sarvamWs.readyState === WebSocket.OPEN || sarvamWs.readyState === WebSocket.CONNECTING) {
      sarvamWs.close();
    }
  };

  clientWs.on("close", cleanupProxy);
  return cleanupProxy;
}

wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
  // Extract real IP from proxy headers (e.g. Render)
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIp = typeof forwardedFor === "string" ? forwardedFor.split(",")[0].trim() : undefined;

  const ip = normalizeIp(realIp || req.socket.remoteAddress || "");

  let sarvamCleanup: (() => void) | null = null;

  ws.on("message", (raw: string | Buffer) => {
    let message: any;
    try {
      message = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!message || !message.type) return;

    const { type, payload, request_id } = message;

    // ── Sarvam STT proxy ──
    if (type === "stt:start") {
      if (sarvamCleanup) sarvamCleanup();
      if (!SARVAM_KEY) {
        sendMessage(ws, "error", { message: "Missing SARVAM_KEY" }, request_id);
        return;
      }
      sarvamCleanup = setupSarvamProxy(ws, payload || {});
      return;
    }
    if (type === "stt:stop") {
      if (sarvamCleanup) { sarvamCleanup(); sarvamCleanup = null; }
      return;
    }

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
      const partnerIds: string[] = Array.isArray(payload?.partner_device_ids)
        ? payload.partner_device_ids
        : [];

      const online = Array.from(clients.values()).filter(
        (client) => client.ws.readyState === WebSocket.OPEN && client.device_id !== deviceId
      );

      let list;
      if (partnerIds.length > 0) {
        // Has partners — return only those partners that are online (works cross-network)
        const partnerSet = new Set(partnerIds);
        list = online.filter((client) => partnerSet.has(client.device_id));
      } else {
        // IP filtering commented out — return all online devices for now
        // const requesterIp = clients.get(deviceId)?.ip || ip;
        // list = online.filter((client) => client.ip === requesterIp);
        list = online;
      }

      sendMessage(ws, "presence:list", list.map((c) => ({ device_id: c.device_id, display_name: c.display_name })), request_id);
      return;
    }

    // S6.T6: Handle pairing:request - create session with TTL
    if (type === "pairing:request") {
      const sessionId = payload?.session_id;
      const fromDeviceId = payload?.from_device_id;
      const toDeviceId = payload?.to_device_id;

      if (!sessionId || !fromDeviceId || !toDeviceId) {

        sendMessage(ws, "error", { message: "Invalid pairing request" }, request_id);
        return;
      }

      // Create pairing session with timestamp
      pairingSessions.set(sessionId, {
        created_at: Date.now(),
        from_device_id: fromDeviceId,
        to_device_id: toDeviceId,
      });


      // Forward to target device
      const target = clients.get(toDeviceId);


      if (target) {

        sendMessage(target.ws, type, payload, request_id);
      } else {

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

      if (!sessionId || !toDeviceId) {

        sendMessage(ws, "error", { message: "Invalid pairing cancel" }, request_id);
        return;
      }

      // Check if session exists
      const session = pairingSessions.get(sessionId);
      if (!session) {

        // Still try to forward in case client needs to clear state
      } else {

      }

      // Forward to target device
      const target = clients.get(toDeviceId);
      if (target) {

        sendMessage(target.ws, type, payload, request_id);

      } else {

        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }

      // Clean up the session since it was cancelled
      if (session) {

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

        sendMessage(target.ws, type, payload, request_id);
      } else {

        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }

      // S6.T6: Session complete - remove to prevent reuse

      pairingSessions.delete(sessionId);
      return;
    }

    // Handle pairing:name_changed - notify paired devices of name changes
    if (type === "pairing:name_changed") {
      const toDeviceId = payload?.to_device_id;
      const fromDeviceId = payload?.from_device_id;
      const newDisplayName = payload?.new_display_name;

      if (!toDeviceId || !fromDeviceId || !newDisplayName) {
        sendMessage(ws, "error", { message: "Invalid name change notification" }, request_id);
        return;
      }

      // Forward to target device
      const target = clients.get(toDeviceId);
      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      }
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

      if (target) {
        sendMessage(target.ws, type, payload, request_id);
      } else {

        sendMessage(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }
  });

  ws.on("close", () => {
    if (sarvamCleanup) { sarvamCleanup(); sarvamCleanup = null; }
    for (const [deviceId, client] of clients.entries()) {
      if (client.ws === ws) {
        clients.delete(deviceId);
      }
    }
  });
});

runPreflight().then(() => {
  server.listen(PORT, () => {
    console.log(`[Startup] Server listening on port ${PORT}`);
  });
}).catch((err: Error) => {
  console.error(`[Startup] Aborting — ${err.message}`);
  process.exit(1);
});
