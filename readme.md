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