import type { ScorerInput, ScoreResult } from './types'

export function pendingActionScorer(input: ScorerInput): ScoreResult {
  const expected = input.case.expectedPendingAction
  if (!expected) return { name: 'pending-action', pass: true, detail: 'n/a' }

  const actual = input.pendingAction
  if (!actual) {
    return { name: 'pending-action', pass: false, detail: `expected ${expected.tool}(${expected.monthly_limit_inr}) but none emitted` }
  }
  const pass =
    actual.tool === expected.tool &&
    actual.params.monthly_limit_inr === expected.monthly_limit_inr
  return {
    name: 'pending-action',
    pass,
    detail: pass
      ? `matched ${actual.tool}(${actual.params.monthly_limit_inr})`
      : `got ${actual.tool}(${actual.params.monthly_limit_inr}), expected ${expected.tool}(${expected.monthly_limit_inr})`,
  }
}
