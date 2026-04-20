import type { ScorerInput, ScoreResult } from './types'

export function replyRegexScorer(input: ScorerInput): ScoreResult {
  const pattern = input.case.replyMustMatch
  if (!pattern) return { name: 'reply-regex', pass: true, detail: 'n/a' }

  const re = new RegExp(pattern, 'i')
  const pass = re.test(input.replyText)
  return {
    name: 'reply-regex',
    pass,
    detail: pass ? `matched /${pattern}/` : `reply did not match /${pattern}/`,
  }
}
