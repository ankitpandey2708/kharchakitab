import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, GITHUB_URL } from "@/src/config/site";

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "What is KharchaKitab?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "KharchaKitab is a free Hinglish voice expense tracker for Indian users. You speak your expenses in Hindi, English, or Hinglish, and the app logs them automatically with AI-powered categorization.",
      },
    },
    {
      "@type": "Question",
      name: "How does Hinglish voice expense tracking work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Tap the mic and say your expense naturally — for example 'chai 20 rupees' or 'auto 80'. KharchaKitab transcribes your speech using Sarvam AI and parses it with Google Gemini to extract the amount, category, and date automatically.",
      },
    },
    {
      "@type": "Question",
      name: "Is KharchaKitab free to use?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. KharchaKitab is completely free. No account or sign-up is required.",
      },
    },
    {
      "@type": "Question",
      name: "Where is my expense data stored?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "All your expenses are stored locally on your device using IndexedDB. No expense data is sent to or stored on KharchaKitab servers.",
      },
    },
    {
      "@type": "Question",
      name: "Does KharchaKitab work offline?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. KharchaKitab is a Progressive Web App (PWA) and works offline after the first load. Voice input and AI parsing require an internet connection, but browsing and editing your expenses works fully offline.",
      },
    },
    {
      "@type": "Question",
      name: "Can I install KharchaKitab on my phone?",
      acceptedAnswer: {
        "@type": "Answer",
        text: `Yes. Open ${SITE_URL} in Chrome or Safari, then use 'Add to Home Screen' to install it as a native-like app on Android or iOS.`,
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "About",
  description: `About ${SITE_NAME} — the Hinglish voice expense tracker built for everyday Indian users. Say it in Hinglish, we'll log it instantly.`,
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 font-[family:var(--font-body)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <nav className="mb-8">
        <Link
          href="/"
          className="text-sm text-[var(--kk-ember)] hover:underline"
        >
          ← Back to KharchaKitab
        </Link>
      </nav>

      <h1 className="mb-6 text-3xl font-bold font-[family:var(--font-display)] tracking-tight">
        About KharchaKitab
      </h1>

      <section className="space-y-8 text-[var(--kk-ink)] leading-relaxed">
        <div>
          <h2 className="mb-3 text-xl font-semibold">What is KharchaKitab?</h2>
          <p>
            KharchaKitab is a free Hinglish voice expense tracker designed for
            Indian users who think and speak in a mix of Hindi and English.
            Instead of tapping through forms, you simply say what you spent —
            &quot;chai 20 rupees&quot; or &quot;auto 80&quot; — and the app
            instantly logs it, categorizes it, and keeps your spending ledger
            up to date.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Why We Built It</h2>
          <p>
            Most expense apps are designed for English speakers and feel
            unnatural to use in daily Indian life. KharchaKitab was built from
            the ground up to understand how Indians actually talk about money —
            in Hinglish, with casual phrasing, local currencies, and everyday
            contexts like chai, autorickshaws, and kirana shops.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Key Features</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Hinglish voice input</strong> — speak naturally in Hindi,
              English, or a mix of both
            </li>
            <li>
              <strong>Automatic categorization</strong> — AI parses your speech
              into clean expense entries with the right category
            </li>
            <li>
              <strong>Recurring expenses</strong> — set up rent, subscriptions,
              and regular bills once, track them automatically
            </li>
            <li>
              <strong>Spending summaries</strong> — see where your money goes
              with daily, weekly, and monthly breakdowns
            </li>
            <li>
              <strong>Works offline</strong> — a Progressive Web App (PWA) that
              works without internet after the first load
            </li>
            <li>
              <strong>Your data stays yours</strong> — all expenses are stored
              locally on your device, not on our servers
            </li>
          </ul>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Privacy First</h2>
          <p>
            We believe your financial data is private. KharchaKitab stores all
            your expenses locally in your browser — no account required, no
            data shared. Read our{" "}
            <Link
              href="/privacy"
              className="text-[var(--kk-ember)] hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            for full details.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Get Started</h2>
          <p>
            Open the app, tap the mic, and say your first expense in Hinglish.
            No sign-up, no setup — just start tracking.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block rounded-lg bg-[var(--kk-ember)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            Open KharchaKitab →
          </Link>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm text-[var(--kk-ash)]">
        <Link href="/features" className="hover:text-[var(--kk-ember)] transition-colors">Features</Link>
        <Link href="/privacy" className="hover:text-[var(--kk-ember)] transition-colors">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-[var(--kk-ember)] transition-colors">Terms of Use</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--kk-ember)] transition-colors">Source on GitHub</a>
      </div>
    </main>
  );
}
