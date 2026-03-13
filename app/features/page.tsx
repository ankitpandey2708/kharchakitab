import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Features — Hinglish Voice Expense Tracker",
  description: `Explore all features of ${SITE_NAME}: Hinglish voice input, automatic expense categorization, recurring bills, spending summaries, PWA offline support, and receipt scanning.`,
  alternates: {
    canonical: "/features",
  },
};

const howToSchema = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How to track expenses with Hinglish voice using KharchaKitab",
  description:
    "Log your daily expenses in Hinglish using your voice — no typing needed.",
  url: `${SITE_URL}/features`,
  step: [
    {
      "@type": "HowToStep",
      name: "Open KharchaKitab",
      text: `Visit ${SITE_URL} or open the installed PWA on your phone.`,
      position: 1,
    },
    {
      "@type": "HowToStep",
      name: "Tap the microphone button",
      text: "Tap the large mic button in the center of the screen to start recording.",
      position: 2,
    },
    {
      "@type": "HowToStep",
      name: "Say your expense in Hinglish",
      text: "Speak naturally — for example: 'chai 20 rupees', 'auto 80', or 'groceries teen sau'. Hindi, English, and Hinglish all work.",
      position: 3,
    },
    {
      "@type": "HowToStep",
      name: "Review the parsed entry",
      text: "KharchaKitab uses AI to extract the amount, category, and date. Review the entry and confirm.",
      position: 4,
    },
    {
      "@type": "HowToStep",
      name: "Track your spending",
      text: "View daily and monthly summaries, category breakdowns, and trends in the Summary and Analytics tabs.",
      position: 5,
    },
  ],
};

const features = [
  {
    title: "Hinglish Voice Input",
    description:
      "Speak your expenses in Hindi, English, or Hinglish — whatever feels natural. KharchaKitab is built for the way Indians actually talk about money. Say 'chai bees rupaye', 'petrol five hundred', or 'EMI paid' and it just works.",
    keywords: ["voice expense tracker India", "Hindi expense tracker", "Hinglish"],
  },
  {
    title: "AI-Powered Expense Parsing",
    description:
      "Powered by Google Gemini and Sarvam AI, KharchaKitab automatically extracts the amount, category, date, and notes from your spoken or typed input. No manual entry — the AI does the hard work.",
    keywords: ["automatic expense categorization", "AI expense tracker"],
  },
  {
    title: "Recurring Expenses",
    description:
      "Set up rent, EMIs, subscriptions, and recurring bills once. KharchaKitab tracks them automatically so you never lose track of fixed monthly outgoings.",
    keywords: ["recurring bills tracker", "subscription tracker India"],
  },
  {
    title: "Spending Summaries & Analytics",
    description:
      "Get daily, weekly, and monthly spending breakdowns. See which categories eat up your budget — food, transport, rent, shopping — and spot patterns in your spending habits.",
    keywords: ["spending summary", "expense analytics", "budget tracker India"],
  },
  {
    title: "Receipt Scanning",
    description:
      "Take a photo of a receipt and KharchaKitab will extract the expense details automatically. Works for grocery bills, restaurant receipts, and most printed or digital receipts.",
    keywords: ["receipt scanner India", "photo expense tracker"],
  },
  {
    title: "Works Offline (PWA)",
    description:
      "KharchaKitab is a Progressive Web App — install it on your Android or iOS home screen and use it like a native app. It loads instantly and works even without internet for browsing and editing.",
    keywords: ["offline expense tracker", "PWA expense app India"],
  },
  {
    title: "Private & Local Storage",
    description:
      "All your expenses are stored on your own device using IndexedDB. No account required. No data shared with servers. Your kharcha stays yours.",
    keywords: ["private expense tracker", "offline-first expense app"],
  },
  {
    title: "Free to Use",
    description:
      "KharchaKitab is completely free. No subscription, no paywall, no hidden charges. Just open it and start tracking.",
    keywords: ["free expense tracker India"],
  },
];

export default function FeaturesPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 font-[family:var(--font-body)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <nav className="mb-8">
        <Link
          href="/"
          className="text-sm text-[var(--kk-ember)] hover:underline"
        >
          ← Back to KharchaKitab
        </Link>
      </nav>

      <h1 className="mb-3 text-3xl font-bold font-[family:var(--font-display)] tracking-tight">
        Features
      </h1>
      <p className="mb-10 text-[var(--kk-ash)] leading-relaxed">
        KharchaKitab is the Hinglish voice expense tracker built for Indian
        daily life. Here&apos;s everything it can do.
      </p>

      <section className="space-y-8">
        {features.map((f) => (
          <div key={f.title} className="border-b border-[var(--kk-smoke)] pb-8 last:border-0">
            <h2 className="mb-2 text-lg font-semibold text-[var(--kk-ink)]">
              {f.title}
            </h2>
            <p className="text-[var(--kk-ash)] leading-relaxed">
              {f.description}
            </p>
          </div>
        ))}
      </section>

      <div className="mt-10 rounded-xl bg-[var(--kk-ember)]/5 border border-[var(--kk-ember)]/20 p-6 text-center">
        <p className="mb-4 font-semibold text-[var(--kk-ink)]">
          Ready to track smarter?
        </p>
        <Link
          href="/"
          className="inline-block rounded-lg bg-[var(--kk-ember)] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
        >
          Open KharchaKitab — It&apos;s Free →
        </Link>
      </div>

      <div className="mt-8 flex flex-wrap gap-4 text-sm text-[var(--kk-ash)]">
        <Link href="/about" className="hover:text-[var(--kk-ember)] transition-colors">About</Link>
        <Link href="/privacy" className="hover:text-[var(--kk-ember)] transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-[var(--kk-ember)] transition-colors">Terms of Use</Link>
      </div>
    </main>
  );
}
