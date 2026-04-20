import type { PendingWriteAction } from '@/src/lib/agent/types'

export interface EvalCase {
  id: string
  tags?: string[]
  snapshot: {
    monthlyBudget?: number
    isHousehold?: boolean
    expenses?: Array<{ daysAgo: number; amount: number; item: string; category: string }>
    recurring?: Array<{ item: string; amount: number; category: string; frequency: string; dueInDays: number }>
  }
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  expectedTools?: string[]
  expectedPendingAction?: { tool: 'set_budget'; monthly_limit_inr: number }
  replyMustMatch?: string
}

export interface ScorerInput {
  case: EvalCase
  replyText: string
  toolCalls: Array<{ toolName: string; input: unknown }>
  toolResults: Array<{ toolName: string; output: unknown }>
  pendingAction: PendingWriteAction | null
}

export interface ScoreResult {
  name: string
  pass: boolean
  detail: string
}
