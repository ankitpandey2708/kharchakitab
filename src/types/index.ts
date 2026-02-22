import type { Frequency } from "@/src/config/recurring";

export interface Transaction {
  id: string;
  amount: number;
  item: string;
  category: string;
  paymentMethod: "cash" | "upi" | "card" | "unknown";
  timestamp: number;
  owner_device_id?: string;
  created_at?: number;
  updated_at?: number;
  is_private?: boolean;
  version?: number;
  version_group_id?: string;
  deleted_at?: number | null;
  conflict?: boolean;
  recurring?: boolean;
  recurring_template_id?: string;
  amortized?: boolean;
  recurring_frequency?: Frequency;
  recurring_total_amount?: number;
}

export interface Recurring_template {
  _id: string;
  item: string;
  category: string;
  amount: number;
  paymentMethod: "cash" | "upi" | "card" | "unknown";
  recurring_template_id?: string | null;
  recurring_frequency: Frequency;
  recurring_start_date: number;
  recurring_end_date: number;
  recurring_next_due_at: number;
  recurring_last_paid_at?: number;
  recurring_reminder_days: number;
  recurring_amortize: boolean;

  // Standard fields
  owner_device_id?: string;
  created_at: number;
  updated_at: number;
  version?: number;
}

export interface RecurringAlertQueueEntry {
  template_id: string;
  item: string;
  recurring_frequency: Frequency;
  recurring_reminder_days: number;
  due_at: number;
  next_fire: number;
  last_fired_at?: number | null;
  end_date?: number | null;
  updated_at: number;
}

export interface AppState {
  isRecording: boolean;
  activeTab: "personal" | "household";
}

export interface TransactionVersion {
  version_id: string;
  transaction_id: string;
  version_index: number;
  updated_at: number;
  editor_device_id: string;
  payload_snapshot: Transaction;
}

export interface DeviceIdentity {
  device_id: string;
  visitor_id?: string;
  display_name: string;
  created_at: number;
  last_active_at: number;
}

export interface PairingRecord {
  partner_device_id: string;
  partner_display_name: string;
  shared_key_id: string;
  created_at: number;
  last_sync_at?: number;
  last_sync_status?: "success" | "failed" | "pending";
  trust_level?: "paired";
}

export interface SyncState {
  partner_device_id: string;
  last_sync_at: number | null;
  last_sync_cursor: number | null;
  last_seen_device_version?: number | null;
  conflicts?: string[];
  last_sync_status?: "success" | "failed" | "pending";
  last_sync_error?: string;
}

export interface SyncStatus {
  partner_device_id: string;
  status: "idle" | "connecting" | "syncing" | "success" | "failed";
  started_at?: number;
  completed_at?: number;
  error?: string;
  progress?: {
    sent: number;
    received: number;
    total_to_send: number;
    total_to_receive: number;
    current_chunk: number;
    total_chunks: number;
  };
}
