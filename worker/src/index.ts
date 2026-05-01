/**
 * Cloudflare Worker + Durable Object replacement for server.ts
 *
 * Architecture:
 * - Worker entry: upgrades WebSocket connections and routes to a single
 *   named SignalingDO instance ("global") so all devices share state.
 * - SignalingDO: uses the WebSocket Hibernation API so idle connections
 *   cost nothing. Device metadata is stored in WS attachments and survives
 *   hibernation cycles. Pairing session state is stored in DO KV storage.
 *
 * Use cases handled (identical to server.ts):
 *   1. Sarvam STT proxy   — stt:start / stt:stop
 *   2. Device presence    — presence:join / presence:ping / presence:list
 *   3. Pairing handshake  — pairing:* messages
 *   4. WebRTC signaling   — webrtc:offer / webrtc:answer / webrtc:candidate
 */

export interface Env {
  SIGNALING: DurableObjectNamespace;
  SARVAM_KEY: string;
}

// ── Worker entry point ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    console.log(`[Worker] Incoming request: ${request.method} ${request.url}`);
    console.log(`[Worker] Upgrade header: ${request.headers.get("upgrade")}`);
    // Health check for uptime monitors
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("OK", { status: 200 });
    }
    // Route all WebSocket connections to the single global DO instance
    const id = env.SIGNALING.idFromName("global");
    const stub = env.SIGNALING.get(id);
    const resp = await stub.fetch(request);
    console.log(`[Worker] DO response status: ${resp.status}, hasWebSocket: ${!!resp.webSocket}`);
    return resp;
  },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface WsAttachment {
  device_id?: string;
  display_name?: string;
  /** Unique per-connection token used to look up the Sarvam proxy */
  conn_id: string;
}

interface PairingSession {
  created_at: number;
  from_device_id: string;
  to_device_id: string;
}

const PAIRING_TTL_MS = 5 * 60 * 1000;
const SARVAM_WS_BASE = "https://api.sarvam.ai/speech-to-text-translate/ws";

// ── Durable Object ────────────────────────────────────────────────────────────

export class SignalingDO {
  private state: DurableObjectState;
  private env: Env;

  /**
   * Sarvam proxy map: conn_id → outbound WebSocket to Sarvam.
   * Lives only in memory — if the DO hibernates all STT sessions will have
   * already ended (clients disconnect when the page is closed).
   */
  private sarvamProxies = new Map<string, WebSocket>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    console.log(`[SignalingDO] Incoming request: ${request.method} ${request.url}`);
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    // Hibernation API — DO sleeps when all connections are idle
    this.state.acceptWebSocket(server);

    const attachment: WsAttachment = { conn_id: crypto.randomUUID() };
    server.serializeAttachment(attachment);

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Hibernation handlers ──────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    const att = ws.deserializeAttachment() as WsAttachment;

    // Audio chunks have no "type" field — forward directly to Sarvam proxy
    if (!message || typeof message.type !== "string") {
      const sarvam = this.sarvamProxies.get(att.conn_id);
      if (sarvam && sarvam.readyState === WebSocket.OPEN) {
        sarvam.send(raw);
      }
      return;
    }

    const { type, payload, request_id } = message as {
      type: string;
      payload: Record<string, unknown>;
      request_id?: string;
    };

    // ── Sarvam STT proxy ──────────────────────────────────────────────────

    if (type === "stt:start") {
      const existing = this.sarvamProxies.get(att.conn_id);
      if (existing) {
        try { existing.close(); } catch { /* ignore */ }
        this.sarvamProxies.delete(att.conn_id);
      }

      if (!this.env.SARVAM_KEY) {
        this.send(ws, "error", { message: "Missing SARVAM_KEY" }, request_id);
        return;
      }

      const cfg = (payload ?? {}) as Record<string, string>;
      const params = new URLSearchParams({
        model: cfg.model || "saaras:v3",
        mode: cfg.mode || "translate",
        sample_rate: cfg.sample_rate || "16000",
        vad_signals: "true",
        high_vad_sensitivity: "true",
        flush_signal: "true",
        input_audio_codec: cfg.input_audio_codec || "pcm_s16le",
      });

      const sarvamWs = await this.openSarvamWs(params);

      // Register listeners and store proxy BEFORE notifying client,
      // so audio chunks arriving immediately after stt:ready are handled.
      sarvamWs.addEventListener("message", (event: MessageEvent) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(event.data);
        }
      });

      sarvamWs.addEventListener("error", (event: Event) => {
        const msg = (event as ErrorEvent).message ?? "Sarvam connection failed";
        this.send(ws, "error", { error: "Sarvam connection failed: " + msg });
      });

      sarvamWs.addEventListener("close", () => {
        this.sarvamProxies.delete(att.conn_id);
        this.send(ws, "stt:closed");
      });

      this.sarvamProxies.set(att.conn_id, sarvamWs);

      // CF Workers outbound WebSocket: no "open" event fires after accept().
      // Connection is ready immediately — notify client now.
      this.send(ws, "stt:ready");
      return;
    }

    if (type === "stt:stop") {
      const sarvam = this.sarvamProxies.get(att.conn_id);
      if (sarvam) {
        try { sarvam.close(); } catch { /* ignore */ }
        this.sarvamProxies.delete(att.conn_id);
      }
      return;
    }

    // Forward flush and any other non-signaling typed messages to Sarvam proxy
    if (!type.startsWith("stt:") && !type.startsWith("presence:") &&
        !type.startsWith("pairing:") && !type.startsWith("webrtc:")) {
      const sarvam = this.sarvamProxies.get(att.conn_id);
      if (sarvam && sarvam.readyState === WebSocket.OPEN) {
        sarvam.send(raw);
      }
      return;
    }

    // ── Presence ─────────────────────────────────────────────────────────

    if (type === "presence:join") {
      const updated: WsAttachment = {
        ...att,
        device_id: payload?.device_id as string | undefined,
        display_name: payload?.display_name as string | undefined,
      };
      ws.serializeAttachment(updated);
      this.send(ws, "presence:ack", { ok: true }, request_id);
      return;
    }

    if (type === "presence:ping") {
      // Nothing to do — just keeping the connection alive via message activity
      return;
    }

    if (type === "presence:list") {
      const requesterDeviceId = att.device_id;
      const partnerIds = new Set(
        Array.isArray(payload?.partner_device_ids)
          ? (payload.partner_device_ids as string[])
          : []
      );

      const online = this.getOnlineDevices(ws);

      let list: Array<{ device_id: string; display_name: string }>;
      if (partnerIds.size > 0) {
        list = online.filter((d) => partnerIds.has(d.device_id));
      } else {
        list = online.filter((d) => d.device_id !== requesterDeviceId);
      }

      this.send(ws, "presence:list", list, request_id);
      return;
    }

    // ── Pairing ──────────────────────────────────────────────────────────

    if (type === "pairing:request") {
      const { session_id, from_device_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !from_device_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing request" }, request_id);
        return;
      }
      await this.state.storage.put<PairingSession>(`session:${session_id}`, {
        created_at: Date.now(),
        from_device_id,
        to_device_id,
      });
      const target = this.findDevice(to_device_id);
      if (target) {
        this.send(target, type, payload, request_id);
      } else {
        this.send(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    if (type === "pairing:accept") {
      const { session_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing accept" }, request_id);
        return;
      }
      const session = await this.state.storage.get<PairingSession>(`session:${session_id}`);
      if (!session) {
        this.send(ws, "error", { message: "Pairing session not found or expired" }, request_id);
        return;
      }
      if (Date.now() - session.created_at > PAIRING_TTL_MS) {
        await this.state.storage.delete(`session:${session_id}`);
        this.send(ws, "error", { message: "Pairing code expired. Please start pairing again.", code: "PAIRING_EXPIRED" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) {
        this.send(target, type, payload, request_id);
      } else {
        this.send(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    if (type === "pairing:confirm") {
      const { session_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing confirm" }, request_id);
        return;
      }
      const session = await this.state.storage.get<PairingSession>(`session:${session_id}`);
      if (!session) {
        this.send(ws, "error", { message: "Pairing session not found or expired" }, request_id);
        return;
      }
      if (Date.now() - session.created_at > PAIRING_TTL_MS) {
        await this.state.storage.delete(`session:${session_id}`);
        this.send(ws, "error", { message: "Pairing code expired. Please start pairing again.", code: "PAIRING_EXPIRED" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) {
        this.send(target, type, payload, request_id);
      } else {
        this.send(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }

    if (type === "pairing:confirm-response") {
      const { session_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing confirm response" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) {
        this.send(target, type, payload, request_id);
      } else {
        this.send(ws, "error", { message: "Target device not connected" }, request_id);
      }
      await this.state.storage.delete(`session:${session_id}`);
      return;
    }

    if (type === "pairing:cancel") {
      const { session_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing cancel" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) this.send(target, type, payload, request_id);
      else this.send(ws, "error", { message: "Target device not connected" }, request_id);
      if (session_id) await this.state.storage.delete(`session:${session_id}`);
      return;
    }

    if (type === "pairing:reject") {
      const { session_id, to_device_id } = payload as Record<string, string>;
      if (!session_id || !to_device_id) {
        this.send(ws, "error", { message: "Invalid pairing reject" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) this.send(target, type, payload, request_id);
      if (session_id && (payload?.final || payload?.reason === "cancelled")) {
        await this.state.storage.delete(`session:${session_id}`);
      }
      return;
    }

    if (type === "pairing:name_changed") {
      const { to_device_id } = payload as Record<string, string>;
      if (!to_device_id) {
        this.send(ws, "error", { message: "Invalid name change notification" }, request_id);
        return;
      }
      const target = this.findDevice(to_device_id);
      if (target) this.send(target, type, payload, request_id);
      return;
    }

    // ── WebRTC signaling ─────────────────────────────────────────────────

    if (type === "webrtc:offer" || type === "webrtc:answer" || type === "webrtc:candidate") {
      const targetId = (payload?.to_device_id) as string | undefined;
      if (!targetId) return;
      const target = this.findDevice(targetId);
      if (target) {
        this.send(target, type, payload, request_id);
      } else {
        this.send(ws, "error", { message: "Target device not connected" }, request_id);
      }
      return;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const att = ws.deserializeAttachment() as WsAttachment;
    console.log(`[SignalingDO] WebSocket closed: conn_id=${att?.conn_id}, code=${code}, reason=${reason}, wasClean=${wasClean}`);
    const sarvam = this.sarvamProxies.get(att.conn_id);
    if (sarvam) {
      try { sarvam.close(); } catch { /* ignore */ }
      this.sarvamProxies.delete(att.conn_id);
    }
  }

  async webSocketError(ws: WebSocket, error: any): Promise<void> {
    console.error(`[SignalingDO] WebSocket error:`, error);
    await this.webSocketClose(ws, 1011, "Internal Error", false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private send(
    ws: WebSocket,
    type: string,
    payload?: unknown,
    request_id?: string
  ): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type, payload, request_id }));
  }

  private getOnlineDevices(
    _excludeWs?: WebSocket
  ): Array<{ device_id: string; display_name: string }> {
    const result: Array<{ device_id: string; display_name: string }> = [];
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment;
      if (att?.device_id) {
        result.push({ device_id: att.device_id, display_name: att.display_name ?? "Unknown" });
      }
    }
    return result;
  }

  private findDevice(device_id: string): WebSocket | null {
    for (const ws of this.state.getWebSockets()) {
      const att = ws.deserializeAttachment() as WsAttachment;
      if (att?.device_id === device_id && ws.readyState === WebSocket.OPEN) {
        return ws;
      }
    }
    return null;
  }

  /**
   * Opens an outbound WebSocket to Sarvam using the Workers fetch API,
   * which allows custom request headers (unlike the browser WebSocket constructor).
   */
  private async openSarvamWs(params: URLSearchParams): Promise<WebSocket> {
    const resp = await fetch(`${SARVAM_WS_BASE}?${params}`, {
      headers: {
        Upgrade: "websocket",
        "api-subscription-key": this.env.SARVAM_KEY,
      },
    });
    const ws = (resp as unknown as { webSocket: WebSocket }).webSocket;
    if (!ws) throw new Error("Sarvam did not return a WebSocket");
    ws.accept();
    return ws;
  }
}
