export interface Transaction {
  id: string;
  amount: number;
  item: string;
  category: string;
  paymentMethod: "cash" | "upi" | "card" | "unknown";
  timestamp: number;
}

export interface AppState {
  isRecording: boolean;
}
