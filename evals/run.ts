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
import { budgetScorer } from './scorers/budget'
import type { EvalCase, ScoreResult } from './scorers/types'

// ── Trace sampling config (L4) ──
const SAMPLE_RATE = 0.05
const LOOKBACK_DAYS = 7
const TRACE_TOKEN_BUDGET = 2000
const TRACE_LATENCY_BUDGET_MS = 15000

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

  const start = Date.now()
  const result = await generateText({
    model: google(modelId),
    system: SYSTEM_PROMPT,
    messages: c.messages,
    tools,
    stopWhen: stepCountIs(5),
    temperature: 0,
  })
  const latencyMs = Date.now() - start
  const totalTokens = result.usage.totalTokens ?? 0

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

  const scores = [
    ...SCORERS.map(s => s({ case: c, replyText: result.text, toolCalls, toolResults, pendingAction })),
    budgetScorer({ case: c, totalTokens, latencyMs }),
  ]
  return { reply: result.text, toolCalls, scores }
}

function fmtRow(id: string, scores: ScoreResult[]) {
  const cells = scores.map(s => `${s.pass ? '✓' : '✗'} ${s.name}`).join('  ')
  return `${id.padEnd(32)}  ${cells}`
}

// ── L4: trace sampling ──

async function fetchTraceEvents(): Promise<any[]> {
  const key = process.env.POSTHOG_PERSONAL_API_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'
  if (!key) throw new Error('POSTHOG_PERSONAL_API_KEY not set')
  const after = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()
  const res = await fetch(`${host}/api/event/?event=agent_completion&after=${after}&limit=500`, {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`PostHog API ${res.status}: ${await res.text()}`)
  const data = await res.json() as any
  return data.results ?? []
}

async function runTrace() {
  const events = await fetchTraceEvents()
  const sampled = events.filter(() => Math.random() < SAMPLE_RATE)

  if (sampled.length === 0) {
    console.log('L4: no events sampled (no production traffic yet or PostHog disabled locally).')
    return true
  }

  console.log(`\nL4 trace sampling: ${sampled.length}/${events.length} events sampled\n`)
  let failures = 0

  for (const e of sampled) {
    const props = e.properties ?? {}
    const fakeCase: EvalCase = {
      id: e.uuid ?? 'trace',
      messages: [{ role: 'user', content: props.user_message ?? '' }],
      snapshot: { expenses: [] },
    }
    const toolCalls = (props.tools_called ?? []).map((t: string) => ({ toolName: t, input: {} }))
    const replyText: string = props.reply ?? ''

    const scores: ScoreResult[] = [
      noHallucinatedNumbersScorer({ case: fakeCase, replyText, toolCalls, toolResults: [], pendingAction: null }),
      writePhrasingScorer({ case: fakeCase, replyText, toolCalls, toolResults: [], pendingAction: null }),
      { name: 'token-budget', pass: (props.total_tokens ?? 0) <= TRACE_TOKEN_BUDGET, detail: `tokens=${props.total_tokens ?? 0} limit=${TRACE_TOKEN_BUDGET}` },
      { name: 'latency-budget', pass: (props.latency_ms ?? 0) <= TRACE_LATENCY_BUDGET_MS, detail: `latency=${props.latency_ms ?? 0}ms limit=${TRACE_LATENCY_BUDGET_MS}ms` },
    ]

    const failed = scores.filter(s => !s.pass)
    if (failed.length > 0) {
      failures++
      console.log(`FAIL [${e.uuid?.slice(0, 8)}] "${replyText.slice(0, 60)}..."`)
      for (const s of failed) console.log(`  ↳ ${s.name}: ${s.detail}`)
    }
  }

  console.log(`L4: ${failures} failure(s) in ${sampled.length} sampled traces`)
  return failures === 0
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2)
  const traceOnly = args.includes('--trace')
  const datasetArg = args.find(a => !a.startsWith('--')) ?? 'evals/datasets/agent.jsonl'
  const filterId = args.find(a => !a.startsWith('--') && a !== datasetArg)

  if (traceOnly) {
    const ok = await runTrace()
    process.exitCode = ok ? 0 : 1
    return
  }

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

  process.exitCode = passed === total ? 0 : 1
}

main().catch(e => {
  console.error(e)
  process.exitCode = 2
})
