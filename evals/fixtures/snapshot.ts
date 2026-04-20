import type { DataSnapshot } from '@/src/lib/agent/types'

const DAY = 86400000

type ExpenseSeed = {
  daysAgo: number
  amount: number
  item: string
  category: string
  paymentMethod?: string
}

type RecurringSeed = {
  item: string
  amount: number
  category: string
  frequency: string
  dueInDays: number
  reminderDays?: number
}

export function buildSnapshot(opts: {
  expenses?: ExpenseSeed[]
  recurring?: RecurringSeed[]
  monthlyBudget?: number
  isHousehold?: boolean
} = {}): DataSnapshot {
  const now = Date.now()
  const today = new Date(now)
  const mk = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  return {
    expenses: (opts.expenses ?? []).map((e, i) => ({
      id: `e${i}`,
      amount: e.amount,
      item: e.item,
      category: e.category,
      paymentMethod: e.paymentMethod ?? 'upi',
      timestamp: now - e.daysAgo * DAY,
    })),
    personalBudgets: opts.monthlyBudget ? { [mk]: opts.monthlyBudget } : {},
    householdBudgets: {},
    isHousehold: opts.isHousehold ?? false,
    deviceId: 'eval-device',
    recurring: (opts.recurring ?? []).map((r, i) => ({
      _id: `r${i}`,
      item: r.item,
      amount: r.amount,
      category: r.category,
      recurring_frequency: r.frequency,
      recurring_next_due_at: now + r.dueInDays * DAY,
      recurring_reminder_days: r.reminderDays ?? 2,
    })),
  }
}
