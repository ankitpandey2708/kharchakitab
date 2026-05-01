type SignalingMessage = {
  type: string;
  payload?: unknown;
  request_id?: string;
};

type Handler = (payload: any) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private pending = new Map<string, (payload: any) => void>();
  private url: string;
  private intentionalClose = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  constructor(url: string) {
    this.url = url;
  }

  connect(): Promise<void> {
    this.intentionalClose = false;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;

      ws.onopen = () => {
        console.log(`[Signaling] WebSocket connected to ${this.url}`);
        this.reconnectDelay = 1000; // reset backoff on successful connect
        resolve();
      };

      ws.onerror = () => {
        console.log(`[Signaling] WebSocket connection failed (readyState: ${ws.readyState}), will retry...`);
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as SignalingMessage;
          console.log(`[Signaling] Received message: ${message.type}`, message.payload);

          if (message.request_id && this.pending.has(message.request_id)) {
            const resolver = this.pending.get(message.request_id);
            this.pending.delete(message.request_id);
            resolver?.(message.payload);
            return;
          }

          const set = this.handlers.get(message.type);
          if (set) {
            set.forEach((handler) => handler(message.payload));
          }
        } catch (e) {
          console.error(`[Signaling] Error parsing message:`, e);
        }
      };

      ws.onclose = (event) => {
        console.log(`[Signaling] WebSocket closed. Code: ${event.code}, Reason: ${event.reason}, WasClean: ${event.wasClean}`);
        this.pending.clear();
        if (!this.intentionalClose) {
          // Emit disconnected so the UI can reflect the dropped state
          this.handlers.get("disconnected")?.forEach((h) => h(null));
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(delay * 2, 30000); // exponential backoff, cap at 30s
    console.log(`[Signaling] Reconnecting in ${delay}ms...`);
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.isConnected()) {
        // Already reconnected (e.g. ensureConnected beat us to it)
        this.handlers.get("reconnected")?.forEach((h) => h(null));
        return;
      }
      try {
        await this.connect();
        this.handlers.get("reconnected")?.forEach((h) => h(null));
      } catch {
        // connect() failed — ws.onclose will fire and scheduleReconnect again
      }
    }, delay);
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)?.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  send(type: string, payload?: unknown) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, payload }));
  }

  request<T = any>(type: string, payload?: unknown): Promise<T> {
    const request_id = `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("Signaling not connected"));
        return;
      }
      this.pending.set(request_id, resolve);
      this.ws.send(JSON.stringify({ type, payload, request_id }));
      window.setTimeout(() => {
        if (this.pending.has(request_id)) {
          this.pending.delete(request_id);
          reject(new Error("Signaling request timed out"));
        }
      }, 15000);
    });
  }

  isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  isConnecting() {
    return this.ws?.readyState === WebSocket.CONNECTING;
  }

  async ensureConnected() {
    if (this.isConnected()) return;
    if (this.isConnecting()) {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Connection timeout")), 10000);
        const check = () => {
          if (this.isConnected()) {
            clearTimeout(timeout);
            resolve();
          } else if (!this.isConnecting()) {
            clearTimeout(timeout);
            reject(new Error("Connection failed"));
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
      return;
    }
    await this.connect();
  }
}
