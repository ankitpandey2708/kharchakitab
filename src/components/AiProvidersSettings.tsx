"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronLeft } from "lucide-react";
import { useBackButton } from "@/src/hooks/useBackButton";

/* ── Provider Definitions (extensible) ── */

interface ProviderDef {
  id: "anthropic" | "gemini";
  label: string;
  icon: React.ReactNode;
  placeholder: string;
  hint: string;
}

/** Anthropic / Claude logo SVG */
const ClaudeLogo = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="#D97757"
  >
    <title>Claude</title>
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fillRule="nonzero" />
  </svg>
);

/** Gemini logo SVG */
const GeminiLogo = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="#1A73E8"
  >
    <title>Gemini</title>
    <path d="M12 24A14.304 14.304 0 000 12 14.304 14.304 0 0012 0a14.304 14.304 0 0012 12 14.304 14.304 0 00-12 12z" />
  </svg>
);

const AI_PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    icon: <ClaudeLogo className="h-5 w-5" />,
    placeholder: "sk-ant-...",
    hint: "From console.anthropic.com. Starts with sk-ant-",
  },
  {
    id: "gemini",
    label: "Gemini",
    icon: <GeminiLogo className="h-5 w-5" />,
    placeholder: "AIza...",
    hint: "From aistudio.google.com. Starts with AIza",
  },
];

/* ── Main Component ── */

interface AiProvidersSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiProvidersSettings = React.memo(
  ({ isOpen, onClose }: AiProvidersSettingsProps) => {
    const [statuses, setStatuses] = useState<
      Record<string, { configured: boolean; source: string }>
    >({});
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<string | null>(null);
    const [keyValue, setKeyValue] = useState("");
    const keyValueRef = useRef(keyValue);
    keyValueRef.current = keyValue;
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useBackButton(isOpen, onClose);

    const fetchStatuses = useCallback(async () => {
      try {
        const res = await fetch("/api/keys");
        if (!res.ok) return;
        const data = (await res.json()) as {
          keys: Array<{ provider: string; configured: boolean; source: string }>;
        };
        const map: Record<string, { configured: boolean; source: string }> = {};
        for (const k of data.keys) map[k.provider] = { configured: k.configured, source: k.source };
        setStatuses(map);
      } catch { void 0; } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      if (isOpen) {
        setLoading(true);
        setEditing(null);
        setKeyValue("");
        setError(null);
        void fetchStatuses();
      }
    }, [isOpen, fetchStatuses]);

    useEffect(() => {
      if (editing) setTimeout(() => inputRef.current?.focus(), 100);
    }, [editing]);

    const handleSave = useCallback(
      async (providerId: string) => {
        const trimmed = keyValueRef.current.trim();
        if (!trimmed) { setError("Please enter an API key."); return; }
        setIsSaving(true);
        setError(null);
        try {
          const res = await fetch("/api/keys", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: providerId, key: trimmed }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string };
          if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to save key");
          setStatuses((prev) => ({ ...prev, [providerId]: { configured: true, source: "cookie" } }));
          setEditing(null);
          setKeyValue("");
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save key");
        } finally {
          setIsSaving(false);
        }
      },
      [],
    );

    const handleRemove = useCallback(async (providerId: string) => {
      try {
        await fetch("/api/keys", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: providerId }),
        });
        setStatuses((prev) => ({ ...prev, [providerId]: { configured: false, source: "none" } }));
        setEditing(null);
        setKeyValue("");
      } catch { void 0; }
    }, []);

    const startEdit = useCallback((providerId: string) => {
      setEditing(providerId);
      setKeyValue("");
      setError(null);
    }, []);

    const configuredCount = AI_PROVIDERS.filter((p) => statuses[p.id]?.configured).length;
    const totalCount = AI_PROVIDERS.length;

    return (
      <AnimatePresence mode="wait">
        {isOpen && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-50 bg-[var(--kk-paper)] overflow-auto overscroll-contain"
          >
            <div className="mx-auto h-full w-full max-w-4xl flex flex-col">
              {/* Header */}
              <header className="z-20 shrink-0 border-b border-[var(--kk-smoke)] bg-[var(--kk-paper)]/90 px-5 py-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="kk-icon-btn kk-icon-btn-lg"
                    aria-label="Go back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <div>
                    <h1
                      className="text-2xl font-semibold font-[family:var(--font-display)]"
                      style={{ color: "var(--kk-ink)" }}
                    >
                      AI Providers
                    </h1>
                    <p className="text-xs text-[var(--kk-ash)] mt-0.5">
                      {loading ? "Loading..." : `${configuredCount} of ${totalCount} configured`}
                    </p>
                  </div>
                </div>
              </header>

              {/* Content */}
              <div className="flex-1 px-4 sm:px-6 py-6">
                <div className="mx-auto w-full max-w-lg space-y-6">
                  {/* Provider list */}
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="flex items-center gap-3 rounded-xl bg-[var(--kk-paper)] p-4 animate-pulse"
                        >
                          <div className="h-10 w-10 rounded-full bg-[var(--kk-smoke)]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3.5 w-32 rounded bg-[var(--kk-smoke)]" />
                            <div className="h-2.5 w-24 rounded bg-[var(--kk-smoke)]" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {AI_PROVIDERS.map((p) => {
                        const st = statuses[p.id] ?? { configured: false, source: "none" };
                        const isEditingThis = editing === p.id;

                        return (
                          <div
                            key={p.id}
                            className="overflow-hidden rounded-xl border border-[var(--kk-smoke)] bg-white/80"
                          >
                            {/* Provider row */}
                            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--kk-cream)]">
                                  {p.icon}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[var(--kk-ink)]">{p.label}</p>
                                  <p className="text-xs text-[var(--kk-ash)] mt-0.5">
                                    {st.configured
                                      ? st.source === "env"
                                        ? "Server key is active"
                                        : "Your key is saved"
                                      : "Not configured"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex-shrink-0">
                                {st.configured && st.source === "env" ? (
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs text-[var(--kk-ash)]">
                                      <Check className="h-3.5 w-3.5 text-[var(--kk-sage)]" />
                                      Server
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(p.id)}
                                      className="rounded-full bg-[var(--kk-paper)] px-3 py-1 text-xs font-semibold text-[var(--kk-ink)] hover:bg-[var(--kk-smoke)] transition-colors"
                                    >
                                      Override
                                    </button>
                                  </div>
                                ) : st.configured ? (
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1 text-xs text-[var(--kk-sage)]">
                                      <Check className="h-3.5 w-3.5" />
                                      Saved
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => startEdit(p.id)}
                                      className="text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
                                    >
                                      Change
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(p.id)}
                                    className="rounded-full bg-[var(--kk-paper)] px-3.5 py-1 text-xs font-semibold text-[var(--kk-ink)] hover:bg-[var(--kk-smoke)] transition-colors"
                                  >
                                    Add Key
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Inline edit area */}
                            {isEditingThis && (
                              <div className="border-t border-[var(--kk-smoke)] px-4 py-3.5 space-y-3">
                                <p className="text-xs text-[var(--kk-ash)] leading-relaxed">{p.hint}</p>
                                <div className="space-y-2">
                                  <input
                                    ref={inputRef}
                                    type="password"
                                    value={keyValue}
                                    onChange={(e) => setKeyValue(e.target.value)}
                                    placeholder={p.placeholder}
                                    className="w-full rounded-lg border border-[var(--kk-smoke)] bg-white px-3 py-2 text-sm font-mono text-[var(--kk-ink)] placeholder:text-[var(--kk-ash)]/50 focus:outline-none focus:border-[var(--kk-sage)]"
                                    autoComplete="off"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void handleSave(p.id);
                                    }}
                                  />
                                </div>
                                {error && <p className="text-xs text-[var(--kk-danger)]">{error}</p>}
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void handleSave(p.id)}
                                    disabled={isSaving || !keyValue.trim()}
                                    className="flex-1 rounded-lg bg-[var(--kk-ink)] py-2 text-xs font-semibold text-white hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {isSaving ? "Saving…" : "Save Key"}
                                  </button>
                                  {st.configured && st.source === "cookie" && (
                                    <button
                                      type="button"
                                      onClick={() => void handleRemove(p.id)}
                                      className="rounded-lg border border-[var(--kk-danger)]/30 bg-white px-4 py-2 text-xs font-semibold text-[var(--kk-danger)] hover:bg-[var(--kk-danger)]/5 transition-colors"
                                    >
                                      Remove
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => { setEditing(null); setKeyValue(""); setError(null); }}
                                    className="rounded-lg border border-[var(--kk-smoke)] bg-white px-4 py-2 text-xs font-semibold text-[var(--kk-ash)] hover:bg-[var(--kk-paper)] transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Info card */}
                  <div className="rounded-xl bg-[var(--kk-cream)] border border-[var(--kk-smoke)] p-4">
                    <p className="text-xs text-[var(--kk-ash)] leading-relaxed">
                      <strong className="text-[var(--kk-ink)]">Provider priority:</strong>{" "}
                      Anthropic is tried first. Gemini serves as fallback if Anthropic is unavailable or has no key configured.
                      Keys are stored in httpOnly cookies — your server never sees them in plaintext logs.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  },
);

AiProvidersSettings.displayName = "AiProvidersSettings";
