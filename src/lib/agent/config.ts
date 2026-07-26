import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import { CLAUDE_OAUTH_MODEL, CLAUDE_SYSTEM_PROMPT_PREFIX } from '@/src/lib/claude/oauth'
import { geminiKey } from '@/src/lib/providers/circuit-breaker'

interface AgentProvider {
  key: string
  label: string
  model: LanguageModel
}

export const SYSTEM_PROMPT = `You are Kharchakitab's financial assistant. You help users understand their spending and manage their budget.

Rules:
- You have NO expense data until you call tools. Never answer with numbers you didn't get from a tool response.
- For questions about "on track", "over budget", "how much spent": call get_budget AND get_summary in the same turn
- For "upcoming bills" or "subscriptions": call get_recurring
- For specific transaction or item lookups: call query_expenses
- Budgets are a single monthly total (not per-category). When the user asks "am I on track", compare total spend across all categories against the one monthly budget limit.
- For WRITE actions (set_budget): call the tool immediately once you have the amount. The tool does NOT execute the write — it returns pending_confirmation and the app shows a confirmation card. In your reply, always echo the amount (e.g. "₹10,000 ka budget set karte hain — neeche confirm karo 👇") — NEVER say the budget "has been set" or "is done" because it hasn't happened yet.
- For query_expenses results: always mention the number of transactions alongside the total (e.g. "₹630 kharch hua — 2 orders mein").
- Language: default to Hinglish — mix Hindi and English the way urban Indians actually speak (e.g. "₹4,650 kharch hua hai", "kaafi room bacha hai", "neeche confirm karo 👇"). Use full English only when the user writes in full English themselves. Never use formal/textbook Hindi.
- Tools cover the current month + last 3 months. If user asks about older data, say it's outside the available window.
- Swiggy food orders: call get_swiggy_addresses first, pick the first address_id, then call get_swiggy_active_orders ONCE with that address_id — do NOT call it for every address. Only call log_swiggy_order (service="food") for orders with status "delivered".
- Swiggy Instamart orders: call get_swiggy_instamart_orders directly — no address_id needed. Only call log_swiggy_order (service="instamart") for orders with status "delivered".
- After calling log_swiggy_order, tell the user to confirm using the button below — NEVER say the expense has been logged yet.`

/**
 * Required prefix for the system prompt when using Claude via OAuth.
 * The API validates that the prompt starts with this exact string.
 */
/**
 * Build the system prompt appropriate for the given provider.
 * Claude OAuth requires the prompt to start with a specific prefix.
 */
export function buildSystemPrompt(providerKey: string): string {
  if (providerKey === 'claude-oauth') {
    return `${CLAUDE_SYSTEM_PROMPT_PREFIX}\n\n${SYSTEM_PROMPT}`
  }
  return SYSTEM_PROMPT
}

/**
 * Create a Claude provider using the user's OAuth access token.
 * The token is sent as Authorization: Bearer, and the required
 * anthropic-beta headers are added automatically.
 */
export function createClaudeProvider(token: string): AgentProvider | null {
  try {
    const anthropic = createAnthropic({
      authToken: token,
      headers: {
        'anthropic-beta': 'oauth-2025-04-20,claude-code-20250219',
      },
    })
    const modelId = CLAUDE_OAUTH_MODEL
    return {
      key: 'claude-oauth',
      label: `claude/${modelId}`,
      model: anthropic(modelId) as unknown as LanguageModel,
    }
  } catch {
    return null
  }
}

export function resolveModelId(): string {
  const raw = process.env.GEMINI_MODEL
  if (!raw) throw new Error('GEMINI_MODEL env var is required')
  const first = raw.split(',').map(s => s.trim()).filter(Boolean)[0]
  if (!first) throw new Error('GEMINI_MODEL is empty after parsing')
  return first.replace(/^models\//, '')
}

export function getGoogleProvider() {
  return createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })
}

export function resolveProviders(): AgentProvider[] {
  const providers: AgentProvider[] = []

  // Gemini models as fallback
  const google = getGoogleProvider()
  const geminiModels = (process.env.GEMINI_MODEL || '').split(',').map(s => s.trim()).filter(Boolean)
  for (const m of geminiModels) {
    const modelId = m.replace(/^models\//, '')
    providers.push({ key: geminiKey(m), label: modelId, model: google(modelId) as LanguageModel })
  }

  return providers
}
