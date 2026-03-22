# Page Agent — Agentic UI Automation

Use this doc as the single source of truth for the page agent feature: architecture, UX flow, configuration, and key decisions.

---

## Overview

The page agent lets users issue natural-language commands ("Go to analytics", "Show recurring expenses") that an AI agent executes by reading and interacting with the DOM. It uses the `page-agent` npm package backed by Gemini, with a server-side proxy to keep API keys off the client.

---

## Architecture

```
User input (BottomTabBar)
    │
    ▼
usePageAgent hook (lazy-loads @page-agent/core + @page-agent/page-controller)
    │
    ▼
PageAgentCore.execute(command)
    │  reads DOM via PageController.getBrowserState()
    │  decides actions (click, scroll, type, etc.)
    │  calls LLM for reasoning
    │
    ▼
POST /api/page-agent/chat/completions  (Next.js API route)
    │  proxies to Gemini OpenAI-compat endpoint
    │  injects GEMINI_API_KEY server-side
    │
    ▼
https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

### Files

| File | Purpose |
|---|---|
| `src/hooks/usePageAgent.ts` | React hook — lazy-loads agent, exposes `execute`, `stop`, `status`, `activity`, `history`, `error` |
| `app/api/page-agent/chat/completions/route.ts` | Server-side proxy — keeps `GEMINI_API_KEY` off the client |
| `src/components/BottomTabBar.tsx` | UI — agent mode integrated into the input pill |

---

## Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google AI API key. Must be set server-side. |
| `GEMINI_MODEL` | No | `models/gemini-3.1-flash-lite-preview` | Comma-separated list. First model is used. `models/` prefix is auto-stripped for the OpenAI-compat endpoint. |

---

## API Route — `/api/page-agent/chat/completions`

- **Method:** `POST`
- **What it does:** Receives the OpenAI-format chat completion request from `@page-agent/core`, injects the API key and model, forwards to Gemini's OpenAI-compatible endpoint, returns the response.
- **Why a proxy:** The `page-agent` library runs client-side and needs an LLM endpoint. The proxy keeps `GEMINI_API_KEY` server-side so it never ships to the browser.
- **Model resolution:** Reads `GEMINI_MODEL` env var, splits by comma, takes the first entry, strips `models/` prefix.

---

## Hook — `usePageAgent()`

### Lazy Loading

The hook lazy-loads `@page-agent/core` and `@page-agent/page-controller` on first use via dynamic `import()`. The agent singleton is cached in a ref — subsequent calls reuse it.

### PageController Config

```ts
new PageController({
  enableMask: false,           // no visual mask overlay
  viewportExpansion: -1,       // scan viewport only
  highlightOpacity: 0,         // hide element highlight boxes
  highlightLabelOpacity: 0,    // hide index number labels
})
```

**Key decision:** `highlightOpacity` and `highlightLabelOpacity` are set to `0` to prevent the library from rendering colored grid overlays and numbered badges on every interactive DOM element. The agent still sees element indices internally for decision-making — only the visual rendering is suppressed.

#### All PageController Config Options

| Option | Type | Default | What it does |
|---|---|---|---|
| `enableMask` | `boolean` | `false` | Show a visual mask overlay during operations |
| `viewportExpansion` | `number` | `0` | How far beyond the viewport to scan (-1 = viewport only) |
| `highlightOpacity` | `number` | `0.1` | Opacity of colored boxes on interactive elements |
| `highlightLabelOpacity` | `number` | `0.5` | Opacity of index number labels on elements |
| `interactiveBlacklist` | `Element[]` | `[]` | Elements to exclude from agent interaction |
| `interactiveWhitelist` | `Element[]` | `[]` | Elements to force-include as interactive |
| `includeAttributes` | `string[]` | `[]` | Extra HTML attributes to capture in DOM tree |

### PageAgentCore Config

```ts
new PageAgentCore({
  pageController,                                    // DOM controller instance
  model: "gemini",                                   // LLM provider
  baseURL: `${window.location.origin}/api/page-agent`, // proxy route
  apiKey: "proxy",                                   // dummy — real key is server-side
  language: "en-US",                                 // agent language
})
```

### Events

The hook wires three events from the agent to React state:

| Event | State updated | Detail |
|---|---|---|
| `statuschange` | `status` | `"idle"` → `"running"` → `"completed"` or `"error"` |
| `historychange` | `history` | Array of `HistoricalEvent` — steps, observations, errors |
| `activity` | `activity` | Real-time activity: `thinking`, `executing`, `executed`, `retrying`, `error` |

### Return Value

```ts
{
  execute: (command: string) => Promise<void>,  // run a command
  stop: () => void,                              // abort execution
  status: AgentStatus,                           // "idle" | "running" | "completed" | "error"
  activity: AgentActivity | null,                // current real-time activity
  history: HistoricalEvent[],                    // step-by-step history
  error: string | null,                          // error message if failed
}
```

### Lifecycle

1. `execute(command)` — resets state, lazy-loads agent, calls `agent.execute(command)`
2. During execution — `statuschange`, `activity`, `historychange` events fire, updating React state
3. On completion — status becomes `"completed"`
4. On error — status becomes `"error"`, error message is set
5. `stop()` — calls `agent.stop()` to abort
6. On unmount — calls `agent.dispose()` for cleanup

---

## Types

### AgentStatus

```ts
"idle" | "running" | "completed" | "error"
```

### AgentActivity (real-time, transient)

```ts
| { type: "thinking" }
| { type: "executing"; tool: string; input: unknown }
| { type: "executed"; tool: string; input: unknown; output: string; duration: number }
| { type: "retrying"; attempt: number; maxAttempts: number }
| { type: "error"; message: string }
```

### HistoricalEvent (persisted step history)

```ts
| { type: "step"; stepIndex: number; reflection: { evaluation_previous_goal, memory, next_goal }; action: { name, input, output } }
| { type: "observation"; content: string }
| { type: "user_takeover" }
| { type: "retry"; message: string; attempt: number; maxAttempts: number }
| { type: "error"; message: string }
```

---

## UX — Integrated into BottomTabBar

The agent is accessed via the existing input pill, not a separate overlay or bottom sheet.

### Pill State Machine (priority order)

```
recording > processing > feedback > agent > typing > idle
```

### Icon Layout by State

| State | Left | Middle | Right |
|---|---|---|---|
| **Idle** | `Bot` icon | Rotating expense hints (tap → typing) | `Mic` (big, ember) |
| **Agent** | `Bot` (active, ember bg) | Agent input field | `Send` or `Stop` |
| **Typing** | `Mic` | Expense input field | `Send` |
| **Recording** | `Stop` (square) | Waveform bars | "listening..." |
| **Processing** | `Spinner` | "processing..." | — |
| **Feedback** | `Check` | item · category · amount | `Undo` |

### Agent Mode Flow

1. **Idle pill** — Bot icon on the left. User taps it.
2. **Agent pill** — Input field appears with ember border, placeholder "What should I do?", auto-focused. Quick suggestion chips appear below (`"Go to analytics"`, `"Show recurring expenses"`, `"Go back to home"`).
3. **User types or taps a suggestion** — agent executes. Input clears. Placeholder shows "Agent is working...". Send button replaced by Stop button.
4. **Completion** — agent finishes. Pill stays in agent mode for further commands.
5. **Dismiss** — tap Bot icon again to close agent mode, return to idle.

### Key Behaviors

- **Mutual exclusion:** Opening agent mode closes typing mode and vice versa.
- **Auto-dismiss:** Recording, processing, or transcript feedback automatically closes agent mode.
- **Suggestion chips:** Only shown when agent is idle and has no history (first interaction). Hidden while agent is running.
- **Keyboard:** Enter submits command. Escape closes agent mode.
- **No step timeline or activity indicators in UI** — agent runs silently. Only the input/placeholder reflects status. This was a deliberate UX decision to avoid cluttering the bottom bar with verbose status grids.

---

## Key Decisions

1. **No separate bottom sheet** — Agent was originally a standalone `PageAgentButton` that opened a full bottom sheet overlay. This competed with the existing BottomTabBar input pill for screen real estate and user attention. Merged into the input pill as a mode toggle instead.

2. **No visual highlights on page** — The `page-agent` library highlights every interactive element with colored borders and index numbers by default (so the LLM can reference elements). Set both opacities to `0` so the agent works invisibly. The agent still indexes elements internally.

3. **No step timeline / thinking indicators** — The agent's step-by-step progress (numbered steps, "Thinking...", "Running tool X") was initially shown above the input pill. Removed to keep the UI clean — the pill placeholder ("Agent is working...") is sufficient feedback.

4. **Server-side proxy** — The `page-agent` library needs an LLM endpoint. Rather than exposing `GEMINI_API_KEY` to the client, a Next.js API route proxies requests. The client sends `apiKey: "proxy"` which is ignored — the real key is injected server-side.

5. **Lazy loading** — `@page-agent/core` and `@page-agent/page-controller` are heavy. They're loaded via dynamic `import()` only when the user first activates agent mode, keeping the initial bundle small.

---

## npm Packages

| Package | Purpose |
|---|---|
| `page-agent` | Top-level package (not directly imported) |
| `@page-agent/core` | `PageAgentCore` — orchestrates the agent loop (observe → think → act) |
| `@page-agent/page-controller` | `PageController` — DOM tree extraction, element interaction, highlighting |
| `@page-agent/llms` | LLM provider adapters (Gemini, OpenAI, etc.) |
| `@page-agent/ui` | Optional UI components (not used — we built custom UI in BottomTabBar) |
