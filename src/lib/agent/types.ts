export interface DataSnapshot {
  expenses: Array<{
    id: string
    amount: number
    item: string
    category: string
    paymentMethod: string
    timestamp: number
  }>

  personalBudgets: Record<string, number>
  householdBudgets: Record<string, {
    amount: number
    updated_at: number
    set_by: string
  }>
  isHousehold: boolean
  deviceId: string

  recurring: Array<{
    _id: string
    item: string
    category: string
    amount: number
    recurring_frequency: string
    recurring_next_due_at: number
    recurring_reminder_days: number
  }>
}

export type PendingWriteAction =
  | {
      tool: 'set_budget'
      params: { monthly_limit_inr: number }
    }
  | {
      tool: 'log_swiggy_order'
      params: {
        order_id: string
        restaurant_name: string
        amount: number
        payment_method: string
        items_display: string
        service?: 'food' | 'instamart'
      }
    }
