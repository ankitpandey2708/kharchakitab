"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Coffee,
  Coins,
  ExternalLink,
  Pencil,
  Share2,
  Smartphone,
  Tag,
  Users,
  Volume2,
  X,
} from "lucide-react";
import posthog from "posthog-js";
import { BackupSettings } from "@/src/components/BackupSettings";
import { CurrencyToggle } from "@/src/components/CurrencyToggle";
import { SoundToggle } from "@/src/components/SoundToggle";
import { getDeviceIdentity, getPairings, setDeviceDisplayName } from "@/src/db/db";
import { useSignaling } from "@/src/context/SignalingContext";
import { SITE_URL } from "@/src/config/site";
import type { DeviceIdentity } from "@/src/types";

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div
    className="kk-label pt-1 pb-0.5"
    style={{ fontSize: "9px", letterSpacing: "0.2em" }}
  >
    {children}
  </div>
);

const SectionDivider = () => (
  <div
    className="my-2"
    style={{
      height: "1px",
      background:
        "linear-gradient(90deg, transparent, var(--kk-smoke-heavy), transparent)",
    }}
  />
);

const SwiggyLogo = ({ className }: { className?: string }) => (
  <svg
    role="img"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    fill="#FC8019"
  >
    <title>Swiggy</title>
    <path d="M12.034 24c-.376-.411-2.075-2.584-3.95-5.513-.547-.916-.901-1.63-.833-1.814.178-.48 3.355-.743 4.333-.308.298.132.29.307.29.409 0 .44-.022 1.619-.022 1.619a.441.441 0 1 0 .883-.002l-.005-2.939c0-.255-.278-.319-.331-.329-.511-.002-1.548-.006-2.661-.006-2.457 0-3.006.101-3.423-.172-.904-.591-2.383-4.577-2.417-6.819C3.849 4.964 5.723 2.225 8.362.868A8.13 8.13 0 0 1 12.026 0c4.177 0 7.617 3.153 8.075 7.209l.001.011c.084.981-5.321 1.189-6.39.904-.164-.044-.206-.212-.206-.284L13.5 4.996a.442.442 0 0 0-.884.002l.009 3.866a.33.33 0 0 0 .268.32l3.354-.001c1.79 0 2.542.207 3.042.588.333.254.461.739.349 1.37C18.633 16.755 12.273 23.71 12.034 24z" />
  </svg>
);

const SettingRow = ({
  icon,
  label,
  description,
  children,
  stackOnMobile = false,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  children: React.ReactNode;
  stackOnMobile?: boolean;
}) => (
  <div
    className={`rounded-[var(--kk-radius-md)] bg-white/80 px-4 py-3 shadow-sm ${
      stackOnMobile
        ? "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        : "flex items-center justify-between gap-3"
    }`}
  >
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)]"
        style={{ color: "var(--kk-ash)" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--kk-ink)]">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--kk-ash)]">
            {description}
          </p>
        )}
      </div>
    </div>
    <div className={stackOnMobile ? "w-full min-w-0 sm:w-auto sm:flex-shrink-0" : "flex-shrink-0"}>
      {children}
    </div>
  </div>
);

const ActionRow = ({
  icon,
  label,
  description,
  onClick,
  trailing = <ChevronRight className="h-4 w-4 text-[var(--kk-ash)]" />,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  trailing?: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center justify-between gap-3 rounded-[var(--kk-radius-md)] bg-white/80 px-4 py-3 text-left shadow-sm transition-transform active:scale-[0.99]"
  >
    <div className="flex items-center gap-3 min-w-0">
      <div
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--kk-cream)]"
        style={{ color: "var(--kk-ash)" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--kk-ink)]">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--kk-ash)]">
            {description}
          </p>
        )}
      </div>
    </div>
    <div className="flex-shrink-0">{trailing}</div>
  </button>
);

const DeviceNameRow = React.memo(() => {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const { refreshPresence, client } = useSignaling();

  useEffect(() => {
    void getDeviceIdentity().then((device) => {
      setIdentity(device);
      setDraft(device.display_name);
    });
  }, []);

  const save = useCallback(async () => {
    if (!draft.trim()) return;
    const newName = draft.trim();
    await setDeviceDisplayName(newName);
    posthog.capture("display_name_changed");
    await refreshPresence(newName);

    const pairings = await getPairings();
    if (client && pairings.length > 0) {
      const latestIdentity = await getDeviceIdentity();
      for (const pairing of pairings) {
        client.send("pairing:name_changed", {
          from_device_id: latestIdentity.device_id,
          to_device_id: pairing.partner_device_id,
          new_display_name: newName,
        });
      }
    }

    const updated = await getDeviceIdentity();
    setIdentity(updated);
    setDraft(updated.display_name);
    setIsEditing(false);
  }, [client, draft, refreshPresence]);

  return (
    <SettingRow
      icon={<Smartphone className="h-4 w-4" />}
      label="Your Name"
      description="Shown when you pair and sync across devices."
      stackOnMobile
    >
      {isEditing ? (
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            className="min-w-0 flex-1 rounded-full bg-[var(--kk-paper)] px-3 py-1.5 text-sm font-semibold text-[var(--kk-ink)] focus:outline-none sm:w-40 sm:flex-none"
          />
          <button
            type="button"
            onClick={() => void save()}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--kk-sage-bg)] text-[var(--kk-sage)]"
            aria-label="Save your name"
          >
            <Check className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex w-full min-w-0 items-center justify-between gap-2 rounded-full bg-[var(--kk-paper)] px-3 py-2 text-sm font-semibold text-[var(--kk-ink)] sm:max-w-[15rem]"
        >
          <span className="min-w-0 truncate text-left">{identity?.display_name || "You"}</span>
          <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-[var(--kk-ash)]" />
        </button>
      )}
    </SettingRow>
  );
});

DeviceNameRow.displayName = "DeviceNameRow";

const SwiggyConnectRow = React.memo(() => {
  const [isLinked, setIsLinked] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("swiggy_linked") === "true" : false
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const cleanupPopup = useCallback(() => {
    if (messageHandlerRef.current) {
      window.removeEventListener("message", messageHandlerRef.current);
      messageHandlerRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
  }, []);

  const handleConnect = useCallback(() => {
    setError(null);
    setIsConnecting(true);
    const popup = window.open("/api/swiggy/authorize", "swiggy_auth", "width=480,height=640,left=200,top=100");
    if (!popup) {
      setError("Popup blocked. Allow popups for this site.");
      setIsConnecting(false);
      return;
    }
    popupRef.current = popup;
    const handler = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === "SWIGGY_CONNECTED") {
        cleanupPopup();
        localStorage.setItem("swiggy_linked", "true");
        setIsLinked(true);
        setIsConnecting(false);
      } else if (e.data?.type === "SWIGGY_ERROR") {
        cleanupPopup();
        setError(e.data.error ?? "Authentication failed");
        setIsConnecting(false);
      }
    };
    messageHandlerRef.current = handler;
    window.addEventListener("message", handler);
    const pollClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollClosed);
        if (messageHandlerRef.current) { cleanupPopup(); setIsConnecting(false); }
      }
    }, 500);
  }, [cleanupPopup]);

  const handleDisconnect = useCallback(async () => {
    await fetch("/api/swiggy/disconnect", { method: "POST" });
    localStorage.removeItem("swiggy_linked");
    localStorage.removeItem("swiggy_address_id");
    setIsLinked(false);
  }, []);

  return (
    <div className="space-y-1.5">
      {isLinked ? (
        <SettingRow
          icon={<SwiggyLogo className="h-4 w-4" />}
          label="Swiggy"
          description="Connected — ask the assistant about your orders"
        >
          <button
            type="button"
            onClick={() => void handleDisconnect()}
            className="text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
          >
            Disconnect
          </button>
        </SettingRow>
      ) : (
        <ActionRow
          icon={<SwiggyLogo className="h-4 w-4" />}
          label="Swiggy"
          description={isConnecting ? "Waiting for login…" : "Connect to log deliveries via the assistant"}
          onClick={isConnecting ? undefined : handleConnect}
          trailing={
            isConnecting
              ? <span className="text-xs text-[var(--kk-ash)]">Connecting…</span>
              : <ChevronRight className="h-4 w-4 text-[var(--kk-ash)]" />
          }
        />
      )}
      {error && (
        <p className="px-1 text-xs text-[var(--kk-danger)]">{error}</p>
      )}
    </div>
  );
});

SwiggyConnectRow.displayName = "SwiggyConnectRow";

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
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fillRule="nonzero"/>
  </svg>
);

const ClaudeConnectRow = React.memo(() => {
  const [isLinked, setIsLinked] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("claude_linked") === "true" : false
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const handleOpenAuth = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/claude/authorize");
      if (!res.ok) throw new Error("Failed to start authorization");
      const { authUrl } = (await res.json()) as { authUrl: string };

      const popup = window.open(authUrl, "claude_auth", "width=640,height=700,left=200,top=100");
      if (!popup) {
        setError("Popup blocked. Allow popups for this site, or open the link manually.");
        return;
      }
      popupRef.current = popup;

      // Poll for popup close — if closed manually without completing, just wait
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          popupRef.current = null;
          // Focus the code input so user can paste
          setTimeout(() => codeInputRef.current?.focus(), 100);
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    }
  }, []);

  const handleConnect = useCallback(async () => {
    const trimmed = authCode.trim();
    if (!trimmed) {
      setError("Please paste the authorization code.");
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/claude/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; email?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to connect");
      }
      localStorage.setItem("claude_linked", "true");
      setAccountEmail(data.email ?? null);
      setIsLinked(true);
      setShowDialog(false);
      setAuthCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setIsConnecting(false);
    }
  }, [authCode]);

  const handleDisconnect = useCallback(async () => {
    await fetch("/api/claude/disconnect", { method: "POST" });
    localStorage.removeItem("claude_linked");
    setIsLinked(false);
    setAccountEmail(null);
    setAuthCode("");
    setShowDialog(false);
  }, []);

  if (isLinked) {
    return (
      <SettingRow
        icon={<ClaudeLogo className="h-4 w-4" />}
        label="Claude"
        description={accountEmail ? `Connected as ${accountEmail}` : "Connected — powers AI responses"}
      >
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          className="text-xs text-[var(--kk-ash)] hover:text-[var(--kk-ink)] transition-colors"
        >
          Disconnect
        </button>
      </SettingRow>
    );
  }

  return (
    <>
      <ActionRow
        icon={<ClaudeLogo className="h-4 w-4" />}
        label="Claude"
        description="Sign in with Claude — use your Claude subscription for AI responses"
        onClick={() => setShowDialog(true)}
        trailing={<ChevronRight className="h-4 w-4 text-[var(--kk-ash)]" />}
      />

      {/* Connect Dialog */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => { if (!isConnecting) setShowDialog(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-[var(--kk-smoke)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f5f0eb]">
                  <ClaudeLogo className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[var(--kk-ink)]">Connect Claude</h3>
                  <p className="text-xs text-[var(--kk-ash)]">Sign in with your Claude account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowDialog(false); setError(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--kk-ash)] hover:bg-[var(--kk-smoke)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Step 1: Open auth page */}
              <div className="rounded-xl bg-[var(--kk-paper)] border border-[var(--kk-smoke)] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--kk-ember)] text-white text-xs font-bold">1</span>
                  <span className="text-sm font-semibold text-[var(--kk-ink)]">Authorize with Claude</span>
                </div>
                <p className="text-xs text-[var(--kk-ash)] mb-3 ml-9">
                  A new window will open. Sign in to your Claude account and approve the permissions.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAuth}
                  className="ml-9 inline-flex items-center gap-2 rounded-full bg-[#D97757] px-4 py-2 text-sm font-semibold text-white hover:bg-[#c0684a] transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Authorization Page
                </button>
              </div>

              {/* Step 2: Paste code */}
              <div className="rounded-xl bg-[var(--kk-paper)] border border-[var(--kk-smoke)] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--kk-ember)] text-white text-xs font-bold">2</span>
                  <span className="text-sm font-semibold text-[var(--kk-ink)]">Paste the code</span>
                </div>
                <p className="text-xs text-[var(--kk-ash)] mb-3 ml-9">
                  After authorizing, you&apos;ll see a code on the page. Copy it and paste it below.
                </p>
                <input
                  ref={codeInputRef}
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  placeholder="Paste authorization code here…"
                  className="ml-9 w-full rounded-lg border border-[var(--kk-smoke)] bg-white px-3 py-2 text-sm font-mono text-[var(--kk-ink)] placeholder:text-[var(--kk-ash)]/50 focus:outline-none focus:border-[var(--kk-sage)]"
                  autoComplete="off"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-xs text-[var(--kk-danger)] px-1">{error}</p>
              )}

              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={isConnecting || !authCode.trim()}
                className="w-full rounded-xl bg-[var(--kk-ink)] py-3 text-sm font-semibold text-white hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isConnecting ? "Connecting…" : "Connect Claude"}
              </button>

              <p className="text-xs text-[var(--kk-ash)] text-center leading-relaxed">
                Your Claude access token is stored securely and used only for AI responses.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

ClaudeConnectRow.displayName = "ClaudeConnectRow";

interface ProfileViewProps {
  onOpenSync: () => void;
  onOpenNotifications: () => void;
  onOpenTags?: () => void;
}

export const ProfileView = React.memo(({ onOpenSync, onOpenNotifications, onOpenTags }: ProfileViewProps) => {
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const handleShare = useCallback(async () => {
    const shareBlurb = "Track daily expenses with KharchaKitab. Fast Hinglish voice expense tracking on phone.";
    const shareText = `${shareBlurb} ${SITE_URL}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "KharchaKitab",
          text: shareBlurb,
          url: SITE_URL,
        });
        posthog.capture("profile_share_clicked", { method: "native_share" });
        setShareMessage(null);
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        posthog.capture("profile_share_clicked", { method: "clipboard" });
        setShareMessage("Share link copied. Paste it into WhatsApp or any app.");
        return;
      }

      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener,noreferrer");
      posthog.capture("profile_share_clicked", { method: "whatsapp_fallback" });
      setShareMessage(null);
    } catch (error) {
      // Ignore user-cancelled native share; only surface fallback guidance.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareMessage("Could not open the share sheet right now.");
    }
  }, []);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <p className="kk-label">Profile</p>
        <div>
          <h2 className="text-3xl font-semibold font-[family:var(--font-display)] tracking-tight text-[var(--kk-ink)]">
            Your setup
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--kk-ash)]">
            Manage app preferences, alerts, and household sync from one place.
          </p>
        </div>
      </div>

      <div className="rounded-[calc(var(--kk-radius-lg)+6px)] border border-[var(--kk-smoke)] bg-white/55 p-4 shadow-[var(--kk-shadow-md)] backdrop-blur-sm sm:p-5">
        <div className="space-y-3">
          <SectionHeader>Household</SectionHeader>
          <ActionRow
            icon={<Users className="h-4 w-4" />}
            label="Sync & Pairing"
            description="Connect devices and keep shared expenses in sync."
            onClick={onOpenSync}
          />

          <SectionDivider />

          <SectionHeader>Alerts</SectionHeader>
          <ActionRow
            icon={<Bell className="h-4 w-4" />}
            label="Notifications"
            description="Manage reminders, recurring alerts, and daily nudges."
            onClick={onOpenNotifications}
          />

          <SectionDivider />

          <SectionHeader>Preferences</SectionHeader>
          <div className="space-y-3">
            <ActionRow
              icon={<Tag className="h-4 w-4" />}
              label="Tags"
              description="Create and manage custom tags for your expenses."
              onClick={onOpenTags}
            />
            <DeviceNameRow />
            <SettingRow
              icon={<Coins className="h-4 w-4" />}
              label="Currency"
              description="Choose how amounts appear across the app."
            >
              <CurrencyToggle />
            </SettingRow>
            <SettingRow
              icon={<Volume2 className="h-4 w-4" />}
              label="Sound"
              description="Turn voice and action feedback sounds on or off."
            >
              <SoundToggle />
            </SettingRow>
          </div>

          <SectionDivider />

          <SectionHeader>Integrations</SectionHeader>
          <SwiggyConnectRow />
          <ClaudeConnectRow />

          <SectionDivider />

          <SectionHeader>Data</SectionHeader>
          <BackupSettings />

          <SectionDivider />

          <SectionHeader>Support</SectionHeader>
          <ActionRow
            icon={<Share2 className="h-4 w-4" />}
            label="Share KharchaKitab"
            description="Send it to friends on WhatsApp or any other app on your phone."
            onClick={() => void handleShare()}
          />
          {shareMessage && (
            <p className="px-1 text-xs text-[var(--kk-ash)]">
              {shareMessage}
            </p>
          )}
          <ActionRow
            icon={<Coffee className="h-4 w-4" />}
            label="Buy me a coffee"
            description="Support KharchaKitab if it’s helping your day-to-day."
            onClick={() => {
              posthog.capture("buymeacoffee_clicked");
              window.open("https://razorpay.me/@ankitpandey2708", "_blank", "noopener,noreferrer");
            }}
          />
        </div>
      </div>
    </section>
  );
});

ProfileView.displayName = "ProfileView";
