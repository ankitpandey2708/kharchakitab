import { createAnthropic } from "@ai-sdk/anthropic";
import { CLAUDE_HEADERS } from "./oauth";

/**
 * Create an Anthropic SDK client configured with an API key.
 */
export function createClaudeClient(apiKey: string) {
  return createAnthropic({
    apiKey,
    headers: CLAUDE_HEADERS,
  });
}
