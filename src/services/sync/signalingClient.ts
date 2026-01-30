export type SignalingMessage = {
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

  constructor(url: string) {
    this.url = url;
  }

  connect(retries = 3, backoff = 1000): Promise<void> {
    return new Promise((resolve, reject) => {
      const attempt = (remaining: number, delay: number) => {
        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => resolve();

        ws.onerror = () => {
          if (remaining > 0) {
            console.log(`Signaling connection failed, retrying in ${delay}ms...`);
            setTimeout(() => attempt(remaining - 1, delay * 2), delay);
          } else {
            reject(new Error("Unable to connect to signaling server after multiple attempts"));
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as SignalingMessage;
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
          } catch {
            // ignore malformed messages
          }
        };

        ws.onclose = () => {
          this.handlers.clear();
          this.pending.clear();
        };
      };

      attempt(retries, backoff);
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.pending.clear();
    this.handlers.clear();
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
