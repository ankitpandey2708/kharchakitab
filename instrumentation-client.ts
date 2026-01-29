import posthog from "posthog-js";

const isProduction = process.env.NODE_ENV === "production";
const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (isProduction && posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: "2025-11-30",
    capture_exceptions: true,
  });
} else {
  posthog.opt_out_capturing();
}
