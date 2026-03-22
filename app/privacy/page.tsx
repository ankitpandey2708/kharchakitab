import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL, GITHUB_URL } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `Privacy Policy for ${SITE_NAME} — learn how we handle your expense data, voice input, and personal information.`,
  alternates: {
    canonical: "/privacy",
  },
};

export default function PrivacyPage() {
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

      <h1 className="mb-2 text-3xl font-bold font-[family:var(--font-display)] tracking-tight">
        Privacy Policy
      </h1>
      <p className="mb-8 text-sm text-[var(--kk-ash)]">
        Last updated: March 2026
      </p>

      <section className="space-y-8 text-[var(--kk-ink)] leading-relaxed">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Overview</h2>
          <p>
            KharchaKitab is a Hinglish voice expense tracker that runs entirely
            in your browser. We are committed to keeping your financial data
            private. This policy explains what data we collect, how it is used,
            and your rights.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Data Storage</h2>
          <p>
            All your expenses, categories, and preferences are stored locally on
            your device using IndexedDB. No expense data is ever sent to our
            servers. Optional cloud sync (if enabled) uses end-to-end encrypted
            storage via Upstash Redis; the sync key lives only on your device.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Voice &amp; AI Processing</h2>
          <p>
            When you use voice input, your audio is sent to Sarvam AI for
            transcription and to Google Gemini for expense parsing. These
            requests are processed in real time and are not stored by
            KharchaKitab. Please review{" "}
            <a
              href="https://sarvam.ai/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--kk-ember)] hover:underline"
            >
              Sarvam AI&apos;s Privacy Policy
            </a>{" "}
            and{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--kk-ember)] hover:underline"
            >
              Google&apos;s Privacy Policy
            </a>{" "}
            for their data handling practices.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Analytics</h2>
          <p>
            We use PostHog to collect anonymous usage analytics (e.g., which
            features are used, error rates). No personally identifiable
            information or expense content is included in these events. You can
            opt out by enabling &quot;Do Not Track&quot; in your browser.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Cookies</h2>
          <p>
            KharchaKitab does not use cookies for tracking. Browser storage
            (localStorage, IndexedDB) is used solely to persist your app data
            locally.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">
            Children&apos;s Privacy
          </h2>
          <p>
            KharchaKitab is not directed at children under 13. We do not
            knowingly collect data from children.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Changes to This Policy</h2>
          <p>
            We may update this policy occasionally. Material changes will be
            noted on this page with an updated date.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Contact</h2>
          <p>
            Questions? Reach out via the{" "}
            <a
              href={`${SITE_URL}`}
              className="text-[var(--kk-ember)] hover:underline"
            >
              KharchaKitab app
            </a>
            .
          </p>
        </div>
      </section>

      <div className="mt-10 flex flex-wrap gap-4 text-sm text-[var(--kk-ash)]">
        <Link href="/about" className="hover:text-[var(--kk-ember)] transition-colors">About</Link>
        <Link href="/features" className="hover:text-[var(--kk-ember)] transition-colors">Features</Link>
        <Link href="/terms" className="hover:text-[var(--kk-ember)] transition-colors">Terms of Use</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--kk-ember)] transition-colors">Source on GitHub</a>
      </div>
    </main>
  );
}
