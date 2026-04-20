import type { ScorerInput, ScoreResult } from './types'

export function toolSelectionScorer(input: ScorerInput): ScoreResult {
  const expected = new Set(input.case.expectedTools ?? [])
  const called = new Set(input.toolCalls.map(t => t.toolName))

  const missing = [...expected].filter(t => !called.has(t))
  const unexpected = [...called].filter(t => !expected.has(t))

  const pass = missing.length === 0 && unexpected.length === 0
  return {
    name: 'tool-selection',
    pass,
    detail: pass
      ? `called=${[...called].join(',') || '∅'}`
      : `missing=[${missing.join(',')}] unexpected=[${unexpected.join(',')}]`,
  }
}
