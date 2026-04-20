import 'dotenv/config'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateText, stepCountIs } from 'ai'
import { createAgentTools } from '../src/lib/agent/tools'
import { SYSTEM_PROMPT, resolveModelId, getGoogleProvider } from '../src/lib/agent/config'
import type { PendingWriteAction } from '../src/lib/agent/types'
import { buildSnapshot } from './fixtures/snapshot'
import { toolSelectionScorer } from './scorers/tool-selection'
import { noHallucinatedNumbersScorer } from './scorers/no-hallucinated-numbers'
import { writePhrasingScorer } from './scorers/write-phrasing'
import { pendingActionScorer } from './scorers/pending-action'
import { replyRegexScorer } from './scorers/reply-regex'
import type { EvalCase, ScoreResult } from './scorers/types'

const SCORERS = [
  toolSelectionScorer,
  noHallucinatedNumbersScorer,
  writePhrasingScorer,
  pendingActionScorer,
  replyRegexScorer,
]

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

async function runCase(c: EvalCase) {
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

  const toolCalls = result.steps.flatMap(s =>
    s.toolCalls.map(tc => ({ toolName: tc.toolName, input: tc.input }))
  )
  const toolResults = result.steps.flatMap(s =>
    s.toolResults.map(tr => ({ toolName: tr.toolName, output: tr.output }))
  )

  let pendingAction: PendingWriteAction | null = null
  for (const tr of toolResults) {
    const out = tr.output as Record<string, unknown> | undefined
    if (out && out.status === 'pending_confirmation') {
      pendingAction = {
        tool: 'set_budget',
        params: { monthly_limit_inr: out.monthly_limit_inr as number },
      }
    }
  }

  const scores = SCORERS.map(s =>
    s({ case: c, replyText: result.text, toolCalls, toolResults, pendingAction })
  )
  return { reply: result.text, toolCalls, scores }
}

function fmtRow(id: string, scores: ScoreResult[]) {
  const cells = scores
    .map(s => `${s.pass ? '✓' : '✗'} ${s.name}`)
    .join('  ')
  return `${id.padEnd(32)}  ${cells}`
}

async function main() {
  const datasetArg = process.argv[2] ?? 'evals/datasets/agent.jsonl'
  const filterId = process.argv[3]
  const cases = loadDataset(resolve(process.cwd(), datasetArg)).filter(
    c => !filterId || c.id === filterId
  )

  console.log(`Running ${cases.length} case(s) against ${resolveModelId()}\n`)

  const allResults: Array<{ id: string; scores: ScoreResult[]; reply: string; toolCalls: Array<{ toolName: string; input: unknown }> }> = []
  for (const c of cases) {
    try {
      const { scores, reply, toolCalls } = await runCase(c)
      allResults.push({ id: c.id, scores, reply, toolCalls })
      console.log(fmtRow(c.id, scores))
      for (const s of scores) {
        if (!s.pass) console.log(`    ↳ ${s.name}: ${s.detail}`)
      }
    } catch (err) {
      console.log(`${c.id.padEnd(32)}  ✗ ERROR ${(err as Error).message}`)
      allResults.push({
        id: c.id,
        scores: [{ name: 'run', pass: false, detail: (err as Error).message }],
        reply: '',
        toolCalls: [],
      })
    }
  }

  const total = allResults.length
  const passed = allResults.filter(r => r.scores.every(s => s.pass)).length
  console.log(`\n${passed}/${total} cases fully passed`)

  if (process.env.EVAL_VERBOSE === '1') {
    console.log('\n--- verbose ---')
    for (const r of allResults) {
      console.log(`\n[${r.id}] tools=${r.toolCalls.map(t => t.toolName).join(',') || '∅'}`)
      console.log(`reply: ${r.reply.slice(0, 200)}`)
    }
  }

  process.exit(passed === total ? 0 : 1)
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
