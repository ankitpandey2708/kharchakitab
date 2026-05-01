import { zodSchema } from 'ai'
import { z } from 'zod'
import type { DataSnapshot } from './types'
import type { Tool } from 'ai'
import { fetchActiveOrders, fetchAddresses, fetchInstamartOrders, isMockMode } from '@/src/lib/swiggy/client'

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

function filterByPeriod(expenses: DataSnapshot['expenses'], period: string) {
  const now = new Date()
  let start: Date
  let end: Date

  switch (period) {
    case 'this_month':
      start = startOfMonth(now)
      end = endOfMonth(now)
      break
    case 'last_month': {
      const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      start = startOfMonth(lm)
      end = endOfMonth(lm)
      break
    }
    case 'last_3_months': {
      const three = new Date(now.getFullYear(), now.getMonth() - 2, 1)
      start = startOfMonth(three)
      end = endOfMonth(now)
      break
    }
    case 'this_week': {
      const day = now.getDay()
      start = new Date(now)
      start.setDate(now.getDate() - day)
      start.setHours(0, 0, 0, 0)
      end = now
      break
    }
    default:
      start = startOfMonth(now)
      end = endOfMonth(now)
  }

  const startMs = start.getTime()
  const endMs = end.getTime()
  return expenses.filter(e => e.timestamp >= startMs && e.timestamp <= endMs)
}

export function createAgentTools(snapshot: DataSnapshot, ctx: { swiggyToken?: string } = {}) {
  let budgetRequested = false

  const swiggyTools: Record<string, Tool> = (ctx.swiggyToken || isMockMode()) ? {
    get_swiggy_addresses: {
      description: 'Fetch the user\'s saved Swiggy delivery addresses. Call this first before get_swiggy_active_orders to obtain a valid address_id.',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const addresses = await fetchAddresses(ctx.swiggyToken ?? 'mock')
        return { addresses }
      },
    } satisfies Tool,

    get_swiggy_active_orders: {
      description: 'Fetch the user\'s active Swiggy food orders. Call get_swiggy_addresses first to get a valid address_id, then pass it here.',
      inputSchema: zodSchema(z.object({
        address_id: z.string().describe('Delivery address ID from get_swiggy_addresses.'),
      })),
      execute: async ({ address_id }: { address_id: string }) => {
        const pollingStart = isMockMode() ? Date.now() - 15_000 : Date.now()
        const orders = await fetchActiveOrders(ctx.swiggyToken ?? 'mock', address_id, pollingStart)
        return { orders }
      },
    } satisfies Tool,

    get_swiggy_instamart_orders: {
      description: 'Fetch the user\'s Swiggy Instamart grocery orders (past 15 days).',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const orders = await fetchInstamartOrders(ctx.swiggyToken ?? 'mock')
        return { orders }
      },
    } satisfies Tool,

    log_swiggy_order: {
      description: 'Log a Swiggy order as an expense. Only call for delivered orders. Returns pending_confirmation — the user must confirm in the UI. In your reply, tell the user to confirm using the button below.',
      inputSchema: zodSchema(z.object({
        order_id: z.string(),
        restaurant_name: z.string().describe('Restaurant name for food orders, store name for Instamart orders.'),
        amount: z.number(),
        payment_method: z.string().describe('upi, card, cash, or wallet'),
        items_display: z.string().describe('Short description of items ordered'),
        service: z.enum(['food', 'instamart']).optional().describe('Source service — food (default) or instamart.'),
      })),
      execute: async (input: { order_id: string; restaurant_name: string; amount: number; payment_method: string; items_display: string; service?: 'food' | 'instamart' }) => {
        return {
          status: 'pending_swiggy_log' as const,
          order: input,
          message: 'Expense has NOT been logged yet. A confirmation card is shown in the UI. Tell the user to confirm using the button below. Do NOT say the expense has been logged.',
        }
      },
    } satisfies Tool,
  } : {}

  return {
    query_expenses: {
      description: 'Filter and return expense transactions. Works across last 4 months. Use date_from/date_to to scope. For totals, use get_summary instead.',
      inputSchema: zodSchema(z.object({
        category: z.string().optional(),
        item_contains: z.string().optional(),
        date_from: z.string().optional().describe('YYYY-MM-DD'),
        date_to: z.string().optional().describe('YYYY-MM-DD'),
        min_amount: z.number().optional(),
        max_amount: z.number().optional(),
      })),
      execute: async (input: {
        category?: string
        item_contains?: string
        date_from?: string
        date_to?: string
        min_amount?: number
        max_amount?: number
      }) => {
        let results = snapshot.expenses

        if (input.category) {
          const cat = input.category.toLowerCase()
          results = results.filter(e => e.category.toLowerCase() === cat)
        }
        if (input.item_contains) {
          const q = input.item_contains.toLowerCase()
          results = results.filter(e => e.item.toLowerCase().includes(q))
        }
        if (input.date_from) {
          const from = new Date(input.date_from).getTime()
          results = results.filter(e => e.timestamp >= from)
        }
        if (input.date_to) {
          const to = new Date(input.date_to).getTime() + 86400000 - 1
          results = results.filter(e => e.timestamp <= to)
        }
        if (input.min_amount !== undefined) {
          results = results.filter(e => e.amount >= input.min_amount!)
        }
        if (input.max_amount !== undefined) {
          results = results.filter(e => e.amount <= input.max_amount!)
        }

        const total = results.length
        const total_amount = Math.round(results.reduce((s, e) => s + e.amount, 0))
        return { expenses: results.slice(0, 50), total_count: total, total_amount }
      },
    } satisfies Tool,

    get_summary: {
      description: 'Return aggregated spend totals. Warning: group_by "item" groups by raw freeform text — results may be fragmented (e.g. "Zomato" vs "zomato order"). Prefer "category" for reliable aggregation.',
      inputSchema: zodSchema(z.object({
        group_by: z.enum(['category', 'item', 'week', 'day']),
        period: z.enum(['this_month', 'last_month', 'last_3_months', 'this_week']),
      })),
      execute: async ({ group_by, period }: { group_by: string; period: string }) => {
        const filtered = filterByPeriod(snapshot.expenses, period)
        const groups: Record<string, { total: number; count: number }> = {}

        for (const e of filtered) {
          let key: string
          switch (group_by) {
            case 'category':
              key = e.category
              break
            case 'item':
              key = e.item
              break
            case 'week': {
              const d = new Date(e.timestamp)
              const weekStart = new Date(d)
              weekStart.setDate(d.getDate() - d.getDay())
              key = weekStart.toISOString().slice(0, 10)
              break
            }
            case 'day':
              key = new Date(e.timestamp).toISOString().slice(0, 10)
              break
            default:
              key = 'unknown'
          }

          if (!groups[key]) groups[key] = { total: 0, count: 0 }
          groups[key].total += e.amount
          groups[key].count += 1
        }

        const period_total = filtered.reduce((s, e) => s + e.amount, 0)
        return {
          groups: Object.entries(groups)
            .map(([name, v]) => ({ name, total: Math.round(v.total), count: v.count }))
            .sort((a, b) => b.total - a.total),
          period_total: Math.round(period_total),
        }
      },
    } satisfies Tool,

    get_budget: {
      description: 'Return the monthly budget limit and current utilization. Budgets are a single monthly total, NOT per-category. Always call this when user asks about being "on track" or "over budget".',
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        const now = new Date()
        const mk = monthKey(now)

        let limit: number | null = null
        let source: string = 'none'

        if (snapshot.isHousehold) {
          const hhEntry = snapshot.householdBudgets[mk]
          if (hhEntry && hhEntry.amount > 0) {
            limit = hhEntry.amount
            source = 'household'
          } else {
            const personal = snapshot.personalBudgets[mk]
            if (personal && personal > 0) {
              limit = personal
              source = 'personal_fallback'
            }
          }
        } else {
          const personal = snapshot.personalBudgets[mk]
          if (personal && personal > 0) {
            limit = personal
            source = 'personal'
          }
        }

        const startMs = startOfMonth(now).getTime()
        const endMs = endOfMonth(now).getTime()
        const spent = Math.round(
          snapshot.expenses
            .filter(e => e.timestamp >= startMs && e.timestamp <= endMs)
            .reduce((s, e) => s + e.amount, 0)
        )

        const pct_used = limit ? Math.round((spent / limit) * 100) : null
        const remaining = limit ? limit - spent : null

        return { limit, spent, pct_used, remaining, source }
      },
    } satisfies Tool,

    get_recurring: {
      description: 'Return recurring expenses due in the next N days. Use for upcoming bills or subscriptions.',
      inputSchema: zodSchema(z.object({
        lookahead_days: z.number().default(7).describe('Max 30'),
      })),
      execute: async ({ lookahead_days }: { lookahead_days: number }) => {
        const days = Math.min(lookahead_days, 30)
        const now = Date.now()
        const windowEnd = now + days * 86400000

        return snapshot.recurring
          .filter(r => r.recurring_next_due_at <= windowEnd)
          .map(r => ({
            name: r.item,
            amount: r.amount,
            due_date: new Date(r.recurring_next_due_at).toISOString().slice(0, 10),
            category: r.category,
            frequency: r.recurring_frequency,
            overdue: r.recurring_next_due_at < now,
          }))
          .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      },
    } satisfies Tool,

    set_budget: {
      description: 'Set the monthly budget. Call immediately once you have the amount. This tool does NOT execute the write — it returns pending_confirmation and the UI shows a confirmation card. Your reply MUST say the action is pending confirmation, NOT that it is done.',
      inputSchema: zodSchema(z.object({
        monthly_limit_inr: z.number(),
      })),
      execute: async ({ monthly_limit_inr }: { monthly_limit_inr: number }) => {
        if (budgetRequested) {
          return { status: 'already_requested' as const, message: 'Budget change already pending confirmation.' }
        }
        budgetRequested = true
        return {
          status: 'pending_confirmation' as const,
          monthly_limit_inr,
          message: 'Budget has NOT been set yet. A confirmation card is shown in the UI. Tell the user to confirm using the button below. Do NOT say the budget has been set.',
        }
      },
    } satisfies Tool,
    ...swiggyTools,
  }
}
