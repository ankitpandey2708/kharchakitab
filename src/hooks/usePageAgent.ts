"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type AgentStatus = "idle" | "running" | "completed" | "error";

export type AgentActivity =
  | { type: "thinking" }
  | { type: "executing"; tool: string; input: unknown }
  | { type: "executed"; tool: string; input: unknown; output: string; duration: number }
  | { type: "retrying"; attempt: number; maxAttempts: number }
  | { type: "error"; message: string };

type HistoricalEvent =
  | { type: "step"; stepIndex: number; reflection: Partial<{ evaluation_previous_goal: string; memory: string; next_goal: string }>; action: { name: string; input: unknown; output: string } }
  | { type: "observation"; content: string }
  | { type: "user_takeover" }
  | { type: "retry"; message: string; attempt: number; maxAttempts: number }
  | { type: "error"; message: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentCore = any;

export function usePageAgent() {
  const agentRef = useRef<AgentCore>(null);
  const controllerRef = useRef<AgentCore>(null);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [activity, setActivity] = useState<AgentActivity | null>(null);
  const [history, setHistory] = useState<HistoricalEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getAgent = useCallback(async () => {
    if (agentRef.current) return agentRef.current;

    const [{ PageAgentCore }, { PageController }] = await Promise.all([
      import("@page-agent/core"),
      import("@page-agent/page-controller"),
    ]);

    // Exclude the agent's own UI from DOM scanning
    const agentFab = document.querySelector(".kk-agent-fab");
    const agentPanel = document.querySelector(".kk-agent-panel");
    const agentBackdrop = document.querySelector(".kk-agent-backdrop");
    const blacklist = [agentFab, agentPanel, agentBackdrop].filter(Boolean) as Element[];

    const pageController = new PageController({
      enableMask: false,
      viewportExpansion: -1,
      highlightOpacity: 0,
      highlightLabelOpacity: 0,
      interactiveBlacklist: blacklist,
    });
    controllerRef.current = pageController;

    const agent = new PageAgentCore({
      pageController,
      // Proxy route keeps GEMINI_API_KEY server-side
      model: "gemini",
      baseURL: `${window.location.origin}/api/page-agent`,
      apiKey: "proxy",
      language: "en-US",
      disableNamedToolChoice: true,
      instructions: {
        system: [
          "You are a power-user assistant for KharchaKitab, a personal expense tracking app.",
          "Your job is to execute multi-step workflows that would otherwise take 3-6 taps.",
          "",
          "App structure:",
          "- 3 tabs in the bottom tab bar: Home, Recurring, Analytics.",
          "- Above the tab bar is an input pill for adding expenses (do NOT type into it).",
          "- A gear icon in the top-right opens Settings.",
          "",
          "=== WORKFLOWS YOU CAN PERFORM ===",
          "",
          "DELETE A TRANSACTION:",
          "1. Find the transaction (on Home: 'LAST 5 TXNS' section, or go to Analytics for older ones).",
          "2. Tap the transaction row to open the action sheet.",
          "3. Tap the delete/trash icon. Tap again to confirm.",
          "",
          "EDIT A TRANSACTION:",
          "1. Find and tap the transaction row to open the action sheet.",
          "2. Tap 'Edit' to open EditModal.",
          "3. Change the relevant fields (amount, item, category, payment method, date).",
          "4. Tap 'Save'.",
          "",
          "SET / EDIT MONTHLY BUDGET:",
          "1. Go to Home tab.",
          "2. Find the MONTHLY BUDGET card. Tap 'Edit' link next to it.",
          "3. Enter the new amount and save.",
          "",
          "ADD RECURRING EXPENSE:",
          "1. Go to Recurring tab.",
          "2. Tap the '+' button in the top-right.",
          "3. Fill in: name, amount, category, payment method, frequency (monthly/quarterly/yearly).",
          "4. Tap 'Save'.",
          "",
          "BROWSE SPENDING HISTORY:",
          "1. Go to Analytics tab (opens as an overlay).",
          "2. Use date filter buttons: Today, 7 Days, 30 Days, This Mo., Last Mo., Custom.",
          "3. Use the search bar to filter by item name.",
          "",
          "REACTIVATE ENDED RECURRING:",
          "1. Go to Recurring tab.",
          "2. Switch filter to 'Ended'.",
          "3. Tap the ended template, edit it, and save to reactivate.",
          "",
          "=== INTERACTION RULES ===",
          "- Do NOT type into the expense input pill — that is the user's job.",
          "- After navigating or clicking, wait for animations/transitions to settle.",
          "- When looking for a specific transaction, scroll through the list or use search.",
          "- If an overlay is open (Analytics, Settings), close it before switching tabs.",
          "- Prefer the shortest path: if already on the right tab, don't navigate away.",
        ].join("\n"),
        getPageInstructions: () => {
          // Single-page app — detect active view from DOM presence
          const tab = document.querySelector(".kk-tab-active");
          const label = tab?.querySelector(".kk-tab-label")?.textContent?.trim().toLowerCase();

          // Check if a full-screen overlay is open
          const hasOverlay = !!document.querySelector(".fixed.inset-0.z-50");

          if (hasOverlay) {
            return [
              "A full-screen overlay is open (Analytics, Notifications, or Settings).",
              "- To go back, look for a back/close button in the overlay header (top-left arrow or top-right X).",
              "- Do NOT click tab bar buttons while an overlay is open — close the overlay first.",
              "- If this is Analytics: date filter buttons are near the top (Today, 7 Days, 30 Days, This Mo., Last Mo., Custom).",
              "- A search bar labeled 'Search expenses...' lets you filter transactions by name.",
              "- Transaction rows are scrollable below the filters — tap one to edit or delete.",
            ].join("\n");
          }

          switch (label) {
            case "home":
              return [
                "You are on the Home tab.",
                "- TOTAL SPENT card shows this month's spending with a budget progress ring.",
                "- TOP SPENDING shows the highest-spend category.",
                "- LAST 5 TXNS lists recent transactions — tap any row to open an action sheet (Edit / Delete).",
                "- MONTHLY BUDGET section has an 'Edit' link that opens an inline budget editor.",
                "- To delete a transaction: tap the row → tap trash icon → tap again to confirm.",
                "- To edit a transaction: tap the row → tap 'Edit' → modify fields in the modal → tap 'Save'.",
              ].join("\n");
            case "recurring":
              return [
                "You are on the Recurring tab.",
                "- Lists recurring expense templates grouped by category.",
                "- Filter tabs at top: Active / Ended / All.",
                "- The '+' button at top-right opens RecurringEditModal to create a new template.",
                "- Tap a template card to edit it (name, amount, category, frequency, reminder days).",
                "- Swipe or tap '...' menu on a row for delete option (two-step confirmation).",
                "- To add: tap '+' → fill name, amount, category, frequency → tap 'Save'.",
              ].join("\n");
            case "analytics":
              return [
                "You are on the Analytics tab (but it may not be the overlay yet).",
                "- Tapping the Analytics tab opens a full-screen overlay with spending charts and history.",
                "- If the overlay is not open yet, tap the Analytics tab button again.",
              ].join("\n");
            default:
              return null;
          }
        },
      },
    });

    // Wire up events → React state
    agent.addEventListener("statuschange", () => setStatus(agent.status));
    agent.addEventListener("historychange", () => setHistory([...agent.history]));
    agent.addEventListener("activity", (e: Event) => {
      setActivity((e as CustomEvent).detail);
    });

    agentRef.current = agent;
    return agent;
  }, []);

  const execute = useCallback(
    async (command: string) => {
      setError(null);
      setActivity(null);
      setHistory([]);
      try {
        const agent = await getAgent();
        await agent.execute(command);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Agent execution failed");
      }
    },
    [getAgent]
  );

  const stop = useCallback(() => {
    agentRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setActivity(null);
    setHistory([]);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      agentRef.current?.dispose();
      agentRef.current = null;
      controllerRef.current = null;
    };
  }, []);

  return { execute, stop, reset, status, activity, history, error };
}
