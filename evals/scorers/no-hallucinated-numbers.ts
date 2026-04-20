import type { ScorerInput, ScoreResult } from './types'

const RUPEE_PATTERN = /₹\s*([\d,]+(?:\.\d+)?)|(?:rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/gi

function normalize(s: string): string {
  return s.replace(/,/g, '').replace(/\.00?$/, '')
}

export function noHallucinatedNumbersScorer(input: ScorerInput): ScoreResult {
  const reply = input.replyText
  const haystack = JSON.stringify({
    results: input.toolResults.map(r => r.output),
    inputs: input.toolCalls.map(c => c.input),
  })

  const found: string[] = []
  const missing: string[] = []
  let m: RegExpExecArray | null
  RUPEE_PATTERN.lastIndex = 0
  while ((m = RUPEE_PATTERN.exec(reply)) !== null) {
    const raw = m[1] ?? m[2]
    if (!raw) continue
    const n = normalize(raw)
    if (n === '0') continue
    found.push(n)
    if (!haystack.includes(n)) missing.push(n)
  }

  const pass = missing.length === 0
  return {
    name: 'no-hallucinated-numbers',
    pass,
    detail: found.length === 0
      ? 'no ₹ amounts in reply'
      : pass
        ? `grounded: ${found.join(',')}`
        : `hallucinated: ${missing.join(',')} (grounded: ${found.filter(f => !missing.includes(f)).join(',') || '∅'})`,
  }
}
