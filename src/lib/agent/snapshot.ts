import { fetchTransactions, getRecurringTemplates, getDeviceIdentity, getPairings } from '@/src/db/db'
import type { DataSnapshot } from './types'
import { LS } from '@/src/config/storageKeys'

export async function buildSnapshot(): Promise<DataSnapshot> {
  console.time('agent:buildSnapshot')

  const now = Date.now()
  const fourMonthsAgo = new Date()
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4)
  fourMonthsAgo.setDate(1)
  fourMonthsAgo.setHours(0, 0, 0, 0)

  const [txns, templates, identity, pairings] = await Promise.all([
    fetchTransactions({ range: { start: fourMonthsAgo.getTime(), end: now } }),
    getRecurringTemplates(),
    getDeviceIdentity(),
    getPairings(),
  ])

  const expenses = txns.map(tx => ({
    id: tx.id,
    amount: tx.amount,
    item: tx.item,
    category: tx.category,
    paymentMethod: tx.paymentMethod,
    timestamp: tx.timestamp,
  }))

  const personalBudgets: Record<string, number> = JSON.parse(
    localStorage.getItem(LS.BUDGETS) || '{}'
  )
  const householdBudgets: Record<string, { amount: number; updated_at: number; set_by: string }> = JSON.parse(
    localStorage.getItem(LS.BUDGETS_HOUSEHOLD) || '{}'
  )

  const recurring = templates.map(t => ({
    _id: t._id,
    item: t.item,
    category: t.category,
    amount: t.amount,
    recurring_frequency: t.recurring_frequency,
    recurring_next_due_at: t.recurring_next_due_at,
    recurring_reminder_days: t.recurring_reminder_days,
  }))

  console.timeEnd('agent:buildSnapshot')

  return {
    expenses,
    personalBudgets,
    householdBudgets,
    isHousehold: pairings.length > 0,
    deviceId: identity.device_id,
    recurring,
  }
}
