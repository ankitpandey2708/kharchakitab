import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/src/config/site";

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
    </main>
  );
}
