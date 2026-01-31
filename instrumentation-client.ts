import posthog from "posthog-js";

const enabledFlag = process.env.NEXT_PUBLIC_POSTHOG_ENABLED;
const isEnabled =
  enabledFlag === undefined
    ? process.env.NODE_ENV === "production"
    : enabledFlag === "true";
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = "/_h";

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    ui_host: "https://us.posthog.com",
    defaults: "2025-11-30",
    capture_exceptions: true,
  });

  if (!isEnabled) {
    posthog.opt_out_capturing();
  }
} else {
  posthog.opt_out_capturing();
}
