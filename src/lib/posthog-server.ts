import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogClient() {
  const enabledFlag = process.env.NEXT_PUBLIC_POSTHOG_ENABLED;
  const isEnabled =
    enabledFlag === undefined
      ? process.env.NODE_ENV === "production"
      : enabledFlag === "true";
  if (!isEnabled) return null;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

export async function shutdownPostHog() {
  if (posthogClient) {
    await posthogClient.shutdown();
  }
}
