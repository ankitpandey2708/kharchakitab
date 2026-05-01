"use client";

import React from "react";
import { BarChart3, RefreshCw, Home, UserRound } from "lucide-react";
import type { AppTab } from "@/src/context/NavigationContext";

export type TabType = AppTab;

interface BottomTabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const BASE_TABS: { key: TabType; label: string; icon: React.ElementType }[] = [
  { key: "summary", label: "Home", icon: Home },
  { key: "recurring", label: "Recurring", icon: RefreshCw },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "profile", label: "Profile", icon: UserRound },
];

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */

export const BottomTabBar = React.memo(({
  activeTab,
  onTabChange,
}: BottomTabBarProps) => {
  const tabs = BASE_TABS;

  return (
    <div className="kk-bottom-tab-bar">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`kk-tab-item ${activeTab === tab.key ? "kk-tab-active" : ""}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
            <span className="kk-tab-label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
});

BottomTabBar.displayName = "BottomTabBar";
