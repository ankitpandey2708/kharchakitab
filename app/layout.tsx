import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_URL,
} from "@/src/config/site";

// Self-hosted (latin-subset variable woff2, committed under app/fonts) rather
// than next/font/google: Turbopack fetches Google Fonts at build time, and that
// fetch fails intermittently on CI, taking the whole build with it.
// See vercel/next.js#78472 and discussions #61886 / #81721.
const bodyFont = localFont({
  src: "./fonts/DMSans-Variable.woff2",
  variable: "--font-body",
  weight: "400 700",
  display: "swap",
});

const displayFont = localFont({
  src: "./fonts/PlayfairDisplay-Variable.woff2",
  variable: "--font-display",
  weight: "600 700",
  display: "swap",
});

const monoFont = localFont({
  src: "./fonts/JetBrainsMono-Variable.woff2",
  variable: "--font-mono",
  weight: "500 600",
  display: "swap",
  preload: false,
});

const metadataBase = new URL(SITE_URL);
const defaultTitle = `${SITE_NAME} — Hinglish Voice Expense Tracker for India`;

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: defaultTitle,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  category: "finance",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: defaultTitle,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    locale: "en_IN",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `KharchaKitab app — say 'chai 20 rupees' and it logs instantly`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon-512.png",
    shortcut: "/icon-192.png",
  },
  manifest: "/manifest.json",
  formatDetection: {
    telephone: false,
    email: false,
    address: false,
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "default",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#faf8f5",
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "WebApplication"],
  name: SITE_NAME,
  description: SITE_DESCRIPTION,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  inLanguage: "en-IN",
  availableLanguage: ["en-IN", "hi-IN"],
  isAccessibleForFree: true,
  featureList: [
    "Hinglish voice input",
    "Automatic expense categorization",
    "Recurring expense tracking",
    "Spending summaries",
    "PWA — works offline",
  ],
  screenshot: `${SITE_URL}/og-image.png`,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "INR",
    url: SITE_URL,
  },
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icon-512.png`,
  },
  image: `${SITE_URL}/og-image.png`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${bodyFont.variable} ${displayFont.variable} ${monoFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
