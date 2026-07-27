import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import type { LanguageModel } from 'ai'
import { CLAUDE_OAUTH_MODEL } from '@/src/lib/claude/oauth'
import { COOKIE_ANTHROPIC_API_KEY, COOKIE_GEMINI_API_KEY } from '@/src/lib/keys'
import { cookies } from 'next/headers'

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
 * Build the system prompt. With API keys, no special prefix is needed.
 */
export function buildSystemPrompt(_providerKey: string): string {
  void _providerKey;
  return SYSTEM_PROMPT
}

/**
 * Create a Claude provider using the user's API key.
 * The key is sent as x-api-key header automatically by @ai-sdk/anthropic.
 */
function createClaudeProvider(apiKey: string): AgentProvider | null {
  try {
    const anthropic = createAnthropic({
      apiKey,
    })
    const modelId = CLAUDE_OAUTH_MODEL
    return {
      key: 'anthropic',
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

export function getGoogleProvider(apiKey?: string) {
  return createGoogleGenerativeAI({ apiKey: apiKey || process.env.GEMINI_API_KEY })
}

/**
 * Resolve available providers using user-provided keys (from cookies)
 * or fall back to server-side env vars.
 */
export async function resolveProviders(): Promise<AgentProvider[]> {
  const providers: AgentProvider[] = []
  const cookieStore = await cookies()

  // User's Anthropic API key (from cookie) — highest priority
  const anthropicApiKey = cookieStore.get(COOKIE_ANTHROPIC_API_KEY)?.value
  if (anthropicApiKey) {
    const claudeProvider = createClaudeProvider(anthropicApiKey)
    if (claudeProvider) {
      providers.push(claudeProvider)
      console.log('[config] Anthropic API key provider added (priority: high)')
    }
  } else if (process.env.ANTHROPIC_API_KEY) {
    const claudeProvider = createClaudeProvider(process.env.ANTHROPIC_API_KEY)
    if (claudeProvider) {
      providers.push(claudeProvider)
      console.log('[config] Anthropic API key provider added (from env)')
    }
  }

  // Gemini models as fallback — check cookie first, then env
  const geminiApiKey = cookieStore.get(COOKIE_GEMINI_API_KEY)?.value || process.env.GEMINI_API_KEY
  if (geminiApiKey) {
    const google = getGoogleProvider(geminiApiKey)
    const geminiModels = (process.env.GEMINI_MODEL || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const m of geminiModels) {
      const modelId = m.replace(/^models\//, '')
      providers.push({
        key: `gemini:${modelId}`,
        label: modelId,
        model: google(modelId) as LanguageModel,
      })
    }
  }

  return providers
}
