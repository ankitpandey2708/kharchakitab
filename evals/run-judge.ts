import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateText, stepCountIs } from 'ai'
import { createAgentTools } from '../src/lib/agent/tools'
import { SYSTEM_PROMPT, resolveModelId, getGoogleProvider } from '../src/lib/agent/config'
import { buildSnapshot } from './fixtures/snapshot'
import type { EvalCase } from './scorers/types'

const JUDGE_MODEL = 'openrouter/free'

function loadDataset(path: string): EvalCase[] {
  const raw = readFileSync(path, 'utf8')
  return raw
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      try {
        return JSON.parse(line) as EvalCase
      } catch (e) {
        throw new Error(`Invalid JSONL on line ${i + 1}: ${(e as Error).message}`)
      }
    })
}

async function getAgentReply(c: EvalCase): Promise<string> {
  const google = getGoogleProvider()
  const modelId = resolveModelId()
  const snapshot = buildSnapshot(c.snapshot)
  const tools = createAgentTools(snapshot)

  const result = await generateText({
    model: google(modelId),
    system: SYSTEM_PROMPT,
    messages: c.messages,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0,
  })
  return result.text
}

async function judgeReplies(
  userMessage: string,
  replyA: string,
  replyB: string,
  rubric: string
): Promise<'A' | 'B' | 'TIE'> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

  const prompt = `${rubric}

---

User message: "${userMessage}"

Reply A:
${replyA}

Reply B:
${replyB}

Which reply is better? Respond with only A, B, or TIE.`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 10,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter ${response.status}: ${err}`)
  }

  const data = await response.json() as any
  const verdict = (data.choices?.[0]?.message?.content ?? '').trim().toUpperCase()
  if (verdict === 'A' || verdict === 'B' || verdict === 'TIE') return verdict
  return 'TIE'
}

async function main() {
  const datasetArg = process.argv[2] ?? 'evals/datasets/agent.jsonl'
  const filterId = process.argv[3]
  const rubric = readFileSync(resolve(process.cwd(), 'evals/judges/tone.md'), 'utf8')

  const cases = loadDataset(resolve(process.cwd(), datasetArg))
    .filter(c => !filterId || c.id === filterId)
    .filter(c => (c as any).goldenReply)

  if (cases.length === 0) {
    console.log('No cases with goldenReply found. Add "goldenReply": "..." to JSONL cases to enable L2 judging.')
    process.exit(0)
  }

  console.log(`L2 judge: ${cases.length} case(s) using ${JUDGE_MODEL} via OpenRouter\n`)

  let wins = 0, ties = 0, losses = 0

  for (const c of cases) {
    const userMessage = c.messages.find(m => m.role === 'user')?.content ?? ''
    const goldenReply = (c as any).goldenReply as string

    try {
      const candidateReply = await getAgentReply(c)
      const verdict = await judgeReplies(userMessage, candidateReply, goldenReply, rubric)

      const symbol = verdict === 'A' ? '✓ win' : verdict === 'TIE' ? '~ tie' : '✗ loss'
      console.log(`${c.id.padEnd(32)}  ${symbol}`)

      if (process.env.EVAL_VERBOSE === '1') {
        console.log(`  candidate: ${candidateReply.slice(0, 150)}`)
        console.log(`  golden:    ${goldenReply.slice(0, 150)}`)
      }

      if (verdict === 'A') wins++
      else if (verdict === 'TIE') ties++
      else losses++
    } catch (err) {
      console.log(`${c.id.padEnd(32)}  ✗ ERROR ${(err as Error).message}`)
      losses++
    }
  }

  console.log(`\n${wins} win / ${ties} tie / ${losses} loss out of ${cases.length} cases`)
  process.exit(losses > 0 ? 1 : 0)
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
