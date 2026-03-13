# SEO Audit Report: KharchaKitab

**URL:** https://kharchakitab.vercel.app/
**Audit Date:** March 13, 2026
**Site Type:** Next.js PWA — Hinglish voice expense tracker targeting Indian users

---

## Executive Summary

KharchaKitab has a solid technical foundation: HTTPS, SSG/prerendering, robots.txt, sitemap, Open Graph, structured data, and PWA support are all in place. However, the site is essentially a **single-screen app with almost no crawlable text content (~47 visible words)**, which is the #1 SEO blocker. Search engines have very little to index or rank. The secondary issues — thin title, keyword-less H1, missing landing/content pages — all flow from the same root problem: the app UI is being served as the only page, with no supporting content or marketing layer.

### Top Priority Issues

1. Critically thin on-page content (~47 visible words — Google has nothing to rank)
2. H1 is brand name only, contains no keyword
3. Title tag is 16 characters short of the optimal 50–60 character range
4. No content pages (About, Features, Blog, Privacy, Terms — all return 404)
5. Hosted on a Vercel subdomain, which limits domain authority

---

## Critical Issues (Fix Immediately)

| Issue | Location | Impact | Evidence | Fix |
|-------|----------|--------|----------|-----|
| **Critically thin content** | Homepage | Very High | Only ~47 visible words on the entire page; the rest is app UI rendered by JS | Add a static landing/marketing section above or below the app — 300–500 words describing the product, its features, and target users |
| **H1 is brand name only** | Homepage | High | `<h1>KharchaKitab</h1>` — no keyword | Change to something like `KharchaKitab — Hinglish Voice Expense Tracker` or split into an H1 with the keyword and use brand elsewhere |
| **No supporting pages** | Site-wide | High | `/about`, `/privacy`, `/terms`, `/features` all return 404 | Create at minimum a Privacy Policy and About page; these also signal trustworthiness (E-E-A-T) |
| **Hosted on `vercel.app` subdomain** | Domain | Medium–High | `kharchakitab.vercel.app` — Vercel subdomain inherits zero authority | Register and point a custom domain (e.g., `kharchakitab.com`) — this is the single highest-leverage action for long-term rankings |

---

## High-Impact Improvements

| Issue | Location | Impact | Evidence | Fix |
|-------|----------|--------|----------|-----|
| **Title tag too short** | `<title>` | Medium | "KharchaKitab \| Hinglish Expense Tracker" = 39 chars (ideal: 50–60) | Expand to ~55 chars, e.g. `KharchaKitab — Hinglish Voice Expense Tracker for India` |
| **Meta description slightly short** | `<meta name="description">` | Low–Medium | 141 chars (ideal: 150–160) | Add ~15–20 more chars and include a CTA, e.g. `Hinglish-first voice expense tracker that turns speech into clean, categorized entries — log spending in seconds and stay on budget. Free to use.` |
| **OG image alt text is generic** | `<meta property="og:image:alt">` | Low | `"KharchaKitab logo"` — describes the logo, not the app value | Change to something descriptive like `"KharchaKitab app screenshot — say chai 20 rupees and it logs instantly"` |
| **Missing `twitter:creator`** | Head | Low | Twitter card has title/description/image but no `twitter:creator` | Add `<meta name="twitter:creator" content="@YourHandle">` |
| **Structured data lacks `screenshot` and `featureList`** | JSON-LD | Medium | The `SoftwareApplication` schema is good but incomplete | Add `screenshot`, `featureList`, and `aggregateRating` (once you have reviews) to the schema — these unlock rich results in Google |
| **No FAQ or HowTo schema** | JSON-LD | Medium | No FAQ or HowTo schema exists | Add a FAQ schema on a landing/features page to capture "how does voice expense tracking work" style queries |
| **Cache-Control doesn't cache statics long-term** | HTTP headers | Medium | `cache-control: public, max-age=0, must-revalidate` for all assets | Vercel's default is fine for HTML, but set longer `max-age` for fingerprinted JS/CSS assets — improves LCP/TTFB for repeat visitors |

---

## Quick Wins

| Opportunity | Page | Potential Impact |
|-------------|------|-----------------|
| Expand title tag by ~16 characters | Homepage | Better CTR from SERPs immediately |
| Expand meta description by ~20 characters + add CTA | Homepage | Better CTR from SERPs immediately |
| Fix H1 to include "Hinglish expense tracker" | Homepage | Clearer keyword signal to Google |
| Add a Privacy Policy page | New page | Trust signals + Google may deindex apps without one |
| Add `featureList` to existing JSON-LD schema | Homepage | Richer structured data in minutes |
| Add `twitter:creator` meta tag | Homepage | 5-minute fix, better social sharing attribution |

---

## Page-by-Page Analysis

### `https://kharchakitab.vercel.app/` (Homepage — only page)

- **Title:** `KharchaKitab | Hinglish Expense Tracker` (39 chars)
  - **Recommended:** `KharchaKitab — Hinglish Voice Expense Tracker for India` (56 chars)
- **Meta Description:** 141 chars, good content but slightly short
  - **Recommended:** Add "Free to use." at the end and refine to 155–160 chars
- **H1:** `KharchaKitab` (brand only)
  - **Recommended:** `KharchaKitab — Hinglish Expense Tracker`
- **H2:** `Say it, we'll log it` — creative but no keyword value
- **Content Score: 2/10** — 47 words visible to crawlers; everything else is app UI
- **Structured Data:** `SoftwareApplication` + `WebApplication` — good, but missing `featureList`, `screenshot`, and `aggregateRating`
- **Canonical:** `https://kharchakitab.vercel.app` — correct, consistent with OG URL
- **Images:** No `<img>` tags in crawlable HTML (app renders icons via SVG/CSS) — neutral
- **Internal links:** None (single-page app)
- **Issues:**
  - Thin content is the critical blocker
  - H1 contains no keyword
  - No secondary pages to support topical authority


---

## Recommended Meta Tag Changes

### Title

```html
<!-- Current (39 chars) -->
<title>KharchaKitab | Hinglish Expense Tracker</title>

<!-- Recommended (56 chars) -->
<title>KharchaKitab — Hinglish Voice Expense Tracker for India</title>
```

### Meta Description

```html
<!-- Current (141 chars) -->
<meta name="description" content="Hinglish-first voice expense tracker that turns speech into clean, categorized entries so you can log daily spending fast and stay on budget." />

<!-- Recommended (157 chars) -->
<meta name="description" content="Hinglish-first voice expense tracker that turns speech into clean, categorized entries — log daily spending fast, stay on budget. Free to use." />
```

### H1

```html
<!-- Current -->
<h1>KharchaKitab</h1>

<!-- Recommended -->
<h1>KharchaKitab — Hinglish Voice Expense Tracker</h1>
```

### OG Image Alt

```html
<!-- Current -->
<meta property="og:image:alt" content="KharchaKitab logo" />

<!-- Recommended -->
<meta property="og:image:alt" content="KharchaKitab app — say 'chai 20 rupees' and it logs instantly" />
```

### Enriched JSON-LD Schema

```json
{
  "@context": "https://schema.org",
  "@type": ["SoftwareApplication", "WebApplication"],
  "name": "KharchaKitab",
  "description": "Hinglish-first voice expense tracker...",
  "applicationCategory": "FinanceApplication",
  "operatingSystem": "Web",
  "url": "https://kharchakitab.vercel.app",
  "inLanguage": "en-IN",
  "availableLanguage": ["en-IN", "hi-IN"],
  "isAccessibleForFree": true,
  "featureList": [
    "Hinglish voice input",
    "Automatic expense categorization",
    "Recurring expense tracking",
    "Spending summaries",
    "PWA — works offline"
  ],
  "screenshot": "https://kharchakitab.vercel.app/og-image.png",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "INR"
  },
  "publisher": {
    "@type": "Organization",
    "name": "KharchaKitab",
    "url": "https://kharchakitab.vercel.app",
    "logo": "https://kharchakitab.vercel.app/icon-512.png"
  }
}
```