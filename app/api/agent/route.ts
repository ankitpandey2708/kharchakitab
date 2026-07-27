import { generateText, streamText, stepCountIs, type ModelMessage } from 'ai'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createAgentTools } from '@/src/lib/agent/tools'
import { resolveProviders, buildSystemPrompt } from '@/src/lib/agent/config'
import type { DataSnapshot, PendingWriteAction } from '@/src/lib/agent/types'
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
  const t0 = Date.now()

  try {
    const { messages, snapshot, stream: wantStream }: {
      messages: ModelMessage[]
      snapshot: DataSnapshot
      stream?: boolean
    } = await request.json()

    const cookieStore = await cookies()
    const swiggyToken = cookieStore.get('swiggy_access_token')?.value
    const tools = createAgentTools(snapshot, { swiggyToken })

    // Build providers list: Anthropic API key (highest priority), then Gemini
    const providers = await resolveProviders()

    // ── Streaming path ──
    if (wantStream) {
      const p = providers[0]
      const systemPrompt = buildSystemPrompt(p.key)
      console.log('[agent] streaming with provider:', p.label)

      const result = streamText({
        model: p.model,
        system: systemPrompt,
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
              userMessage: typeof messages.at(-1)?.content === 'string' ? (messages.at(-1)?.content as string) : '',
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
            send({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })
          } finally {
            controller.close()
          }
        },
      })

      const streamResponse = new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        },
      })

      return streamResponse
    }

    // ── Non-streaming path: try each provider in order ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any = null
    let chosenLabel = ''

    for (const p of providers) {
      const systemPrompt = buildSystemPrompt(p.key)
      console.log('[agent] trying provider:', p.label)
      try {
        result = await generateText({
          model: p.model,
          system: systemPrompt,
          messages,
          tools,
          stopWhen: stepCountIs(5),
          temperature: 0,
        })
        chosenLabel = p.label
        break
      } catch (err) {
        console.log(`[agent] provider ${p.label} failed: ${err instanceof Error ? err.message : err}, trying next`)
        continue
      }
    }

    if (!result) {
      console.log('[agent] all providers failed')
      return NextResponse.json(
        { reply: 'Something went wrong, try again shortly.', responseMessages: [], pendingActions: [] },
        { status: 503 },
      )
    }

    const pendingActions = extractPendingActions(result.steps)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolsCalled = result.steps.flatMap((s: any) => s.toolCalls.map((tc: any) => tc.toolName))
    console.log('[agent] steps:', result.steps.length, 'tools-called:', toolsCalled, 'provider:', chosenLabel)
    captureCompletion({
      userMessage: typeof messages.at(-1)?.content === 'string' ? (messages.at(-1)?.content as string) : '',
      reply: result.text,
      toolsCalled,
      totalTokens: result.usage.totalTokens ?? 0,
      latencyMs: Date.now() - t0,
      provider: chosenLabel,
    })

    return NextResponse.json({
      reply: result.text,
      responseMessages: result.response.messages,
      pendingActions,
    })
  } catch (error) {
    console.error('agent:error', error)
    return NextResponse.json(
      {
        reply: 'Something went wrong, try again.',
        responseMessages: [],
        pendingAction: null,
      },
      { status: 200 },
    )
  }
}
