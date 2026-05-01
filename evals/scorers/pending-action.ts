import type { ScorerInput, ScoreResult } from './types'

export function pendingActionScorer(input: ScorerInput): ScoreResult {
  const expected = input.case.expectedPendingAction
  if (!expected) return { name: 'pending-action', pass: true, detail: 'n/a' }

  const actual = input.pendingAction
  if (!actual) {
    return { name: 'pending-action', pass: false, detail: `expected ${expected.tool}(${expected.monthly_limit_inr}) but none emitted` }
  }
  const actualAmount = actual.tool === 'set_budget' ? actual.params.monthly_limit_inr : undefined
  const pass = actual.tool === expected.tool && actualAmount === expected.monthly_limit_inr
  return {
    name: 'pending-action',
    pass,
    detail: pass
      ? `matched ${actual.tool}(${actualAmount})`
      : `got ${actual.tool}(${actualAmount}), expected ${expected.tool}(${expected.monthly_limit_inr})`,
  }
}
