"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  ChevronRight,
  Coffee,
  Coins,
  Pencil,
  Share2,
  ShoppingBag,
  Smartphone,
  Users,
  Volume2,
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
  const [isLinked, setIsLinked] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  useEffect(() => {
    setIsLinked(localStorage.getItem("swiggy_linked") === "true");
  }, []);

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
          icon={<ShoppingBag className="h-4 w-4" />}
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
          icon={<ShoppingBag className="h-4 w-4" />}
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

interface ProfileViewProps {
  onOpenSync: () => void;
  onOpenNotifications: () => void;
}

export const ProfileView = React.memo(({ onOpenSync, onOpenNotifications }: ProfileViewProps) => {
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
