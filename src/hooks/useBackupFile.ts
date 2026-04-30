import { useCallback, useEffect, useRef, useState } from "react";
import {
  deserializeBackup,
  serializeBackup,
  type BackupData,
} from "@/src/lib/backup";
import { getTransactionsUpdatedSince } from "@/src/db/db";
import { LS } from "@/src/config/storageKeys";

type BackupFileStatus =
  | "idle"
  | "exporting"
  | "confirming"
  | "importing"
  | "done"
  | "error";

export function useBackupFile() {
  const [status, setStatus] = useState<BackupFileStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<BackupData | null>(null);
  const [txCount, setTxCount] = useState(0);
  const [needsBackup, setNeedsBackup] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const lastBackupAt = Number(localStorage.getItem(LS.LAST_BACKUP_AT) ?? "0");
    void getTransactionsUpdatedSince(lastBackupAt).then((txns) => {
      setNeedsBackup(txns.length > 0);
    });
  }, []);

  const downloadBackup = useCallback(async () => {
    try {
      setStatus("exporting");
      setError(null);
      const data = await serializeBackup();
      const blob = new Blob([JSON.stringify(data)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kharchakitab-backup-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      localStorage.setItem(LS.LAST_BACKUP_AT, String(Date.now()));
      setNeedsBackup(false);
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2500);
    } catch {
      setError("Could not create backup file.");
      setStatus("error");
    }
  }, []);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";
      try {
        setStatus("importing");
        setError(null);
        const text = await file.text();
        const data = JSON.parse(text) as BackupData;
        if (data.version !== 1) throw new Error("Unsupported backup version");
        setTxCount(data.indexedDB.transactions?.length ?? 0);
        setPendingData(data);
        setStatus("confirming");
      } catch {
        setError("Could not read the backup file. Make sure it's a valid KharchaKitab backup.");
        setStatus("error");
      }
    },
    []
  );

  const confirmRestore = useCallback(async () => {
    if (!pendingData) return;
    try {
      setStatus("importing");
      await deserializeBackup(pendingData);
      setPendingData(null);
      window.location.reload();
    } catch {
      setError("Restore failed. The backup file may be corrupted.");
      setStatus("error");
    }
  }, [pendingData]);

  const cancelRestore = useCallback(() => {
    setPendingData(null);
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    txCount,
    needsBackup,
    fileInputRef,
    downloadBackup,
    openFilePicker,
    onFileSelected,
    confirmRestore,
    cancelRestore,
  };
}
