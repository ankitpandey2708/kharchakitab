import { generateText, streamText, stepCountIs } from 'ai'
import { cookies } from 'next/headers'
import { createAgentTools } from '@/src/lib/agent/tools'
import { SYSTEM_PROMPT, resolveProviders } from '@/src/lib/agent/config'
import type { DataSnapshot, PendingWriteAction } from '@/src/lib/agent/types'
import { isOnCooldown, setCooldown, extractRateLimit } from '@/src/lib/providers/circuit-breaker'
import { PostHog } from 'posthog-node'

function captureCompletion(props: {
  userMessage: string
  reply: string
  toolsCalled: string[]
  totalTokens: number
  latencyMs: number
  provider: string
}) {
  if (process.env.NEXT_PUBLIC_POSTHOG_ENABLED !== 'true') return
  const client = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  })
  client.capture({
    distinctId: 'server',
    event: 'agent_completion',
    properties: {
      user_message: props.userMessage,
      reply: props.reply,
      tools_called: props.toolsCalled,
      total_tokens: props.totalTokens,
      latency_ms: props.latencyMs,
      provider: props.provider,
    },
  })
  client.shutdown()
}

function extractPendingActions(steps: Array<{ toolResults: Array<{ output: unknown }> }>): PendingWriteAction[] {
  const pendingActions: PendingWriteAction[] = []
  for (const step of steps) {
    for (const tr of step.toolResults) {
      const output = tr.output as Record<string, unknown> | undefined
      if (output?.status === 'pending_confirmation') {
        pendingActions.push({
          tool: 'set_budget',
          params: { monthly_limit_inr: output.monthly_limit_inr as number },
        })
      } else if (output?.status === 'pending_swiggy_log') {
        const o = output.order as Record<string, unknown>
        pendingActions.push({
          tool: 'log_swiggy_order',
          params: {
            order_id: o.order_id as string,
            restaurant_name: o.restaurant_name as string,
            amount: o.amount as number,
            payment_method: o.payment_method as string,
            items_display: o.items_display as string,
            service: (o.service as 'food' | 'instamart' | undefined) ?? 'food',
          },
        })
      }
    }
  }
  return pendingActions
}

export async function POST(request: Request) {
  console.time('agent:total-roundtrip')
  const t0 = Date.now()

  try {
    const { messages, snapshot, stream: wantStream }: {
      messages: any[]
      snapshot: DataSnapshot
      stream?: boolean
    } = await request.json()

    const cookieStore = await cookies()
    const swiggyToken = cookieStore.get('swiggy_access_token')?.value
    const tools = createAgentTools(snapshot, { swiggyToken })

    const providers = resolveProviders()
    const available = providers.filter(p => !isOnCooldown(p.key))

    if (available.length === 0) {
      console.log('[agent] all providers on cooldown')
      return Response.json({ error: 'All AI providers are rate-limited, try again shortly.' }, { status: 503 })
    }

    // ── Streaming path ──
    // streamText() is synchronous — 429 can only surface during stream consumption,
    // not at call time. So we pick the first available provider and handle rate-limit
    // errors inside the SSE stream, setting cooldown so the next request skips it.
    if (wantStream) {
      const p = available[0]
      console.log('[agent] streaming with provider:', p.label)

      const result = streamText({
        model: p.model,
        system: SYSTEM_PROMPT,
        messages,
        tools,
        stopWhen: stepCountIs(5),
        temperature: 0,
      })

      const encoder = new TextEncoder()

      const stream = new ReadableStream({
        async start(controller) {
          const send = (data: Record<string, unknown>) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          }

          try {
            const streamResult = await result

            for await (const chunk of streamResult.textStream) {
              send({ type: 'text', content: chunk })
            }

            const pendingActions: PendingWriteAction[] = []
            const steps = await streamResult.steps
            console.log('[agent] stream steps:', steps.length, 'tools-called:', steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)))
            pendingActions.push(...extractPendingActions(steps))

            const response = await streamResult.response
            const usage = await streamResult.usage
            captureCompletion({
              userMessage: messages.at(-1)?.content ?? '',
              reply: (await streamResult.text),
              toolsCalled: steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)),
              totalTokens: usage.totalTokens ?? 0,
              latencyMs: Date.now() - t0,
              provider: p.label,
            })
            send({ type: 'response_messages', messages: response.messages })
            if (pendingActions.length > 0) {
              send({ type: 'pending_actions', actions: pendingActions })
            }
            send({ type: 'done' })
          } catch (err) {
            const { isRateLimit, retryAfterSec } = extractRateLimit(err)
            if (isRateLimit) {
              setCooldown(p.key, retryAfterSec)
              console.log(`[agent] stream rate-limited on ${p.key}, cooldown set`)
              send({ type: 'error', message: 'Rate limited, please retry.', code: 'rate_limit' })
            } else {
              send({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })
            }
          } finally {
            controller.close()
            console.timeEnd('agent:total-roundtrip')
          }
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })
    }

    // ── Non-streaming path: try each provider in order, skip on 429 ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null
    let chosenLabel = ''

    for (const p of available) {
      console.log('[agent] trying provider:', p.label)
      try {
        result = await generateText({
          model: p.model,
          system: SYSTEM_PROMPT,
          messages,
          tools,
          stopWhen: stepCountIs(5),
          temperature: 0,
        })
        chosenLabel = p.label
        break
      } catch (err) {
        const { isRateLimit, retryAfterSec } = extractRateLimit(err)
        if (isRateLimit) {
          setCooldown(p.key, retryAfterSec)
          console.log(`[agent] rate-limited on ${p.key}, trying next provider`)
          continue
        }
        throw err
      }
    }

    if (!result) {
      console.log('[agent] all providers exhausted')
      console.timeEnd('agent:total-roundtrip')
      return Response.json(
        { reply: 'All AI providers are rate-limited, try again shortly.', responseMessages: [], pendingActions: [] },
        { status: 503 },
      )
    }

    const pendingActions = extractPendingActions(result.steps)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolsCalled = result.steps.flatMap((s: any) => s.toolCalls.map((tc: any) => tc.toolName))
    console.log('[agent] steps:', result.steps.length, 'tools-called:', toolsCalled, 'provider:', chosenLabel)
    captureCompletion({
      userMessage: messages.at(-1)?.content ?? '',
      reply: result.text,
      toolsCalled,
      totalTokens: result.usage.totalTokens ?? 0,
      latencyMs: Date.now() - t0,
      provider: chosenLabel,
    })
    console.timeEnd('agent:total-roundtrip')

    return Response.json({
      reply: result.text,
      responseMessages: result.response.messages,
      pendingActions,
    })
  } catch (error) {
    console.error('agent:error', error)
    console.timeEnd('agent:total-roundtrip')
    return Response.json(
      {
        reply: 'Something went wrong, try again.',
        responseMessages: [],
        pendingAction: null,
      },
      { status: 200 },
    )
  }
}
