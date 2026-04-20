import type { ScorerInput, ScoreResult } from './types'

const PAST_TENSE = /\b(has been set|is set|updated|saved|done|changed to|set to)\b/i
const CONFIRM_CUE = /\b(confirm|below|button|tap|click)\b/i

export function writePhrasingScorer(input: ScorerInput): ScoreResult {
  const calledSetBudget = input.toolCalls.some(t => t.toolName === 'set_budget')
  if (!calledSetBudget) {
    return { name: 'write-phrasing', pass: true, detail: 'n/a (no write)' }
  }

  const reply = input.replyText
  const leaksPastTense = PAST_TENSE.test(reply)
  const asksConfirm = CONFIRM_CUE.test(reply)

  const pass = !leaksPastTense && asksConfirm
  const problems: string[] = []
  if (leaksPastTense) problems.push('claims action is done')
  if (!asksConfirm) problems.push('missing confirm cue')

  return {
    name: 'write-phrasing',
    pass,
    detail: pass ? 'pending-confirm phrasing OK' : problems.join('; '),
  }
}
