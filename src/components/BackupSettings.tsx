"use client";

import React from "react";
import { Download, RotateCcw, CheckCircle2, AlertCircle, HardDrive } from "lucide-react";
import { useBackupFile } from "@/src/hooks/useBackupFile";
import { useStoragePersistence } from "@/src/hooks/useStoragePersistence";

export const BackupSettings = React.memo(() => {
  const {
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
  } = useBackupFile();

  const { isPersisted, usagePercent, usageMB, quotaMB, isNearFull } = useStoragePersistence();

  const isWorking = status === "exporting" || status === "importing";

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => void onFileSelected(e)}
      />

      {/* Download */}
      <button
        type="button"
        disabled={isWorking}
        onClick={() => void downloadBackup()}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--kk-radius-md)] bg-white/80 px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.99] disabled:opacity-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)]"
            style={{ color: "var(--kk-ash)" }}
          >
            {status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-[var(--kk-sage)]" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[var(--kk-ink)]">
                {status === "exporting" ? "Creating backup…" : status === "done" ? "Backup downloaded" : "Download backup"}
              </p>
              {needsBackup && status === "idle" && (
                <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--kk-ember)]" />
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[var(--kk-ash)]">
              {needsBackup && status === "idle"
                ? "New transactions since your last backup."
                : "Save a JSON file with all your data."}
            </p>
          </div>
        </div>
      </button>

      {/* Restore */}
      {status === "confirming" ? (
        <div className="rounded-[var(--kk-radius-md)] bg-white/80 px-4 py-3 shadow-sm space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)]"
              style={{ color: "var(--kk-ash)" }}
            >
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--kk-ink)]">
                Found {txCount} transaction{txCount !== 1 ? "s" : ""}. Restore?
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--kk-ash)]">
                This will overwrite your current data.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void confirmRestore()}
              className="flex-1 rounded-full bg-[var(--kk-ember)] py-2 text-sm font-semibold text-white transition-opacity active:opacity-80"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={cancelRestore}
              className="flex-1 rounded-full bg-[var(--kk-cream)] py-2 text-sm font-semibold text-[var(--kk-ink)] transition-opacity active:opacity-80"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={isWorking}
          onClick={openFilePicker}
          className="flex w-full items-center justify-between gap-3 rounded-[var(--kk-radius-md)] bg-white/80 px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.99] disabled:opacity-50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)]"
              style={{ color: "var(--kk-ash)" }}
            >
              <RotateCcw className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--kk-ink)]">
                {status === "importing" ? "Reading file…" : "Restore from file"}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--kk-ash)]">
                Pick a backup JSON to restore your data.
              </p>
            </div>
          </div>
        </button>
      )}

      {status === "error" && error && (
        <div className="flex items-center gap-2 rounded-[var(--kk-radius-md)] bg-[var(--kk-danger-bg)] px-4 py-3">
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-[var(--kk-danger-ink)]" />
          <p className="text-xs text-[var(--kk-danger-ink)]">{error}</p>
        </div>
      )}

      {/* Storage status info */}
      {usagePercent !== null && (
        <div className={`flex items-center gap-2 rounded-[var(--kk-radius-md)] px-4 py-3 ${isNearFull ? "bg-[var(--kk-danger-bg)]" : "bg-white/60"}`}>
          <HardDrive className={`h-4 w-4 flex-shrink-0 ${isNearFull ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ash)]"}`} />
          <div className="flex-1 min-w-0">
            <p className={`text-xs font-medium ${isNearFull ? "text-[var(--kk-danger-ink)]" : "text-[var(--kk-ash)]"}`}>
              {isNearFull
                ? `Storage ${usagePercent}% full — download a backup now!`
                : `Storage: ${usageMB} MB of ${quotaMB} MB used (${usagePercent}%)`}
            </p>
            {isPersisted === false && (
              <p className="text-xs text-[var(--kk-ash)] mt-0.5">
                ⚠️ Data not yet protected — add to home screen to enable persistent storage.
              </p>
            )}
            {isPersisted === true && (
              <p className="text-xs text-[var(--kk-sage)] mt-0.5">
                ✓ Data is protected from automatic clearing.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

BackupSettings.displayName = "BackupSettings";
