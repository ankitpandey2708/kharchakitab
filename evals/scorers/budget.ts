import type { ScoreResult } from './types'
import type { EvalCase } from './types'

interface BudgetInput {
  case: EvalCase
  totalTokens: number
  latencyMs: number
}

export function budgetScorer({ case: c, totalTokens, latencyMs }: BudgetInput): ScoreResult {
  if (c.maxTokens === undefined && c.maxLatencyMs === undefined) {
    return { name: 'budget', pass: true, detail: 'no limits set' }
  }

  const failures: string[] = []

  if (c.maxTokens !== undefined && totalTokens > c.maxTokens) {
    failures.push(`tokens ${totalTokens} > limit ${c.maxTokens}`)
  }
  if (c.maxLatencyMs !== undefined && latencyMs > c.maxLatencyMs) {
    failures.push(`latency ${latencyMs}ms > limit ${c.maxLatencyMs}ms`)
  }

  return {
    name: 'budget',
    pass: failures.length === 0,
    detail: failures.length > 0 ? failures.join(', ') : `tokens=${totalTokens} latency=${latencyMs}ms`,
  }
}
