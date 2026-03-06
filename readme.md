[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/ankitpandey2708/kharchakitab)

# KharchaKitab 💰

**KharchaKitab** is a modern, privacy-focused personal finance and expense tracker designed to make managing your money effortless. Built as a Progressive Web App (PWA), it works seamlessly offline and offers a premium user experience with smart features like voice-powered logging and recurring expense management.

## ✨ Key Features

- **Smart Logging**: Add expenses manually or use voice commands (powered by Sarvam AI) for quick entry.
- **Recurring Expenses**: Manage subscriptions and recurring bills with automated reminders and visualizations.
- **Offline First**: robust offline support using IndexedDB, so you can track expenses even without internet.
- **Analytics & Trends**: Visualize your spending habits with interactive charts, category breakdowns, and monthly trends.
- **Cross-Device Sync**: Optional sync capabilities (configured with Upstash Redis).
- **Privacy Focused**: Your data primarily lives on your device.

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (React 19)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **State/Animation**: Framer Motion
- **Database**: IndexedDB (client-side), Upstash Redis (optional sync)
- **AI/LLM**: Google Gemini (for processing), Sarvam AI (for voice)
- **Analytics**: PostHog

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or pnpm

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/ankitpandey2708/kharchakitab.git
    cd kharchakitab
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    pnpm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env.local` file in the root directory and populate it with your keys:

    ```env
    # AI Services
    GEMINI_API_KEY=""
    SARVAM_KEY=""

    # Database (Upstash Redis for Sync)
    UPSTASH_REDIS_REST_URL=""
    UPSTASH_REDIS_REST_TOKEN=""

    # Analytics (PostHog)
    NEXT_PUBLIC_POSTHOG_KEY=""
    NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
    NEXT_PUBLIC_POSTHOG_ENABLED="false"
    ```

4.  **Run the development server:**
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## 📱 PWA Support

This application is fully PWA-compliant. You can install it on your mobile device (iOS/Android) or desktop for a native app-like experience.

*****
*******
await new Promise(r => indexedDB.open("QuickLogDB").onsuccess = e => e.target.result.transaction("transactions").objectStore("transactions").getAll().onsuccess = ev => r(ev.target.result.sort((a, b) => a.timestamp - b.timestamp).map(tx => ({...tx, timestamp: new Date(tx.timestamp).toLocaleDateString("en-IN", {day: "2-digit", month: "short", year: "numeric"})}))));


localStorage.setItem('kk_streak_count', '12');
localStorage.setItem('kk_streak_last_date', '2026-03-03');
*******
iOS User Setup (send this to any iOS user)

PART 1 — Install the app (do this first, takes 30 seconds)
1. Open this link in Safari (not Chrome, not Instagram — must be Safari).
2. Tap the Share button (box with arrow icon) at the bottom of Safari.
3. Scroll down → tap “Add to Home Screen” → tap “Add”.
4. Close Safari. Open KharchaKitab from your home screen icon.
5. When asked about notifications → tap Allow (needed for payment reminders).
    - If you tapped Don’t Allow: Settings → KharchaKitab → Notifications → Allow.

PART 2 — Set up receipt scanning via share sheet (optional but useful)
1. Open the Shortcuts app → tap + to create a new shortcut.
2. Tap Add Action → search “Receive Images” → add it.
    - Tap the action’s settings (i) and enable “Show in Share Sheet”.
3. Tap Add Action → search “Get Contents of URL” → add it.
    - URL: https://kharchakitab.vercel.app/api/share/submit
    - Add a field: image = Shortcut Input
4. Tap Add Action → search “Open URLs” → add it.
    - Input should be the result from “Get Contents of URL”.
5. Name the shortcut: KharchaKitab Share → tap Done.
- Now: open any photo/receipt → Share → KharchaKitab Share → app opens with receipt loaded.
