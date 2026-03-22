const rawSiteUrl = "https://kharchakitab.vercel.app";

export const SITE_URL = rawSiteUrl.endsWith("/")
  ? rawSiteUrl.slice(0, -1)
  : rawSiteUrl;
export const SITE_NAME = "KharchaKitab";
export const SITE_DESCRIPTION =
  "Hinglish-first voice expense tracker that turns speech into clean, categorized entries — log daily spending fast, stay on budget. Free to use.";
export const GITHUB_URL = "https://github.com/ankitpandey2708/kharchakitab";
export const SITE_KEYWORDS = [
  "Hinglish expense tracker",
  "Hindi English voice expense",
  "voice expense tracker",
  "speech to expense",
  "personal finance",
  "expense tracking app",
  "spending log",
  "Indian expense tracker",
];
