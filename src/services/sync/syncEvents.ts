type SyncEventType = "sync:start" | "sync:progress" | "sync:complete" | "sync:error" | "sync:refresh";

type SyncEventListener = (data?: any) => void;

class SyncEventEmitter {
    private listeners: Map<SyncEventType, SyncEventListener[]> = new Map();

    on(event: SyncEventType, listener: SyncEventListener): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)!.push(listener);

        // Return unsubscribe function
        return () => {
            const arr = this.listeners.get(event);
            if (arr) {
                const index = arr.indexOf(listener);
                if (index > -1) {
                    arr.splice(index, 1);
                }
            }
        };
    }

    emit(event: SyncEventType, data?: any): void {
        const arr = this.listeners.get(event);
        if (arr) {
            arr.forEach((listener) => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in sync event listener for ${event}:`, error);
                }
            });
        }
    }

    removeAllListeners(event?: SyncEventType): void {
        if (event) {
            this.listeners.delete(event);
        } else {
            this.listeners.clear();
        }
    }
}

// Singleton instance
export const syncEvents = new SyncEventEmitter();
