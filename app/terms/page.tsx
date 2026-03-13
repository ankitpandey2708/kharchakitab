import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/src/config/site";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: `Terms of Use for ${SITE_NAME} — the Hinglish voice expense tracker. Read our terms before using the app.`,
  alternates: {
    canonical: "/terms",
  },
};

export default function TermsPage() {
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
        Terms of Use
      </h1>
      <p className="mb-8 text-sm text-[var(--kk-ash)]">
        Last updated: March 2026
      </p>

      <section className="space-y-8 text-[var(--kk-ink)] leading-relaxed">
        <div>
          <h2 className="mb-3 text-xl font-semibold">Acceptance of Terms</h2>
          <p>
            By accessing or using KharchaKitab (&quot;the app&quot;), you agree
            to be bound by these Terms of Use. If you do not agree, please do
            not use the app.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Use of the App</h2>
          <p>
            KharchaKitab is a personal expense tracking tool provided free of
            charge. You may use it for personal, non-commercial purposes. You
            agree not to misuse the app, attempt to reverse engineer it, or use
            it in any way that violates applicable laws.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Your Data</h2>
          <p>
            All expense data you enter is stored locally on your own device.
            You are solely responsible for maintaining backups of your data.
            KharchaKitab is not liable for any data loss resulting from browser
            storage being cleared, device changes, or other circumstances.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Third-Party Services</h2>
          <p>
            The app uses third-party services including Sarvam AI (voice
            transcription) and Google Gemini (expense parsing). Your use of
            these features is also subject to the respective terms and privacy
            policies of those services. KharchaKitab is not responsible for
            the practices of third-party providers.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Disclaimer of Warranties</h2>
          <p>
            KharchaKitab is provided &quot;as is&quot; without warranties of
            any kind. We do not guarantee that the app will be error-free,
            uninterrupted, or that AI-parsed expense entries will always be
            accurate. Always verify important financial entries yourself.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, KharchaKitab and its
            creators shall not be liable for any indirect, incidental, or
            consequential damages arising from your use of the app.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Changes to These Terms</h2>
          <p>
            We may update these Terms of Use from time to time. Continued use
            of the app after changes are posted constitutes acceptance of the
            revised terms.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-xl font-semibold">Governing Law</h2>
          <p>
            These terms are governed by the laws of India. Any disputes shall
            be subject to the jurisdiction of courts in India.
          </p>
        </div>

        <div className="border-t border-[var(--kk-smoke)] pt-6 text-sm text-[var(--kk-ash)]">
          Also see our{" "}
          <Link href="/privacy" className="text-[var(--kk-ember)] hover:underline">
            Privacy Policy
          </Link>
          .
        </div>
      </section>
    </main>
  );
}
