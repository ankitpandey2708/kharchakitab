import { generateText, streamText, stepCountIs } from 'ai'
import { cookies } from 'next/headers'
import { createAgentTools } from '@/src/lib/agent/tools'
import { SYSTEM_PROMPT, resolveModelId, getGoogleProvider } from '@/src/lib/agent/config'
import type { DataSnapshot, PendingWriteAction } from '@/src/lib/agent/types'
import { PostHog } from 'posthog-node'

const google = getGoogleProvider()
const MODEL_ID = resolveModelId()

console.log('[agent] route loaded, MODEL_ID:', MODEL_ID)

function captureCompletion(props: {
  userMessage: string
  reply: string
  toolsCalled: string[]
  totalTokens: number
  latencyMs: number
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
      model: MODEL_ID,
    },
  })
  client.shutdown()
}

export async function POST(request: Request) {
  console.log('[agent] POST called, using model:', MODEL_ID)
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

    // ── Streaming path ──
    if (wantStream) {
      const result = streamText({
        model: google(MODEL_ID),
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

            // Stream text chunks
            for await (const chunk of streamResult.textStream) {
              send({ type: 'text', content: chunk })
            }

            // After streaming is done, check for pending actions and send response messages
            let pendingAction: PendingWriteAction | null = null
            const steps = await streamResult.steps
            console.log('[agent] stream steps:', steps.length, 'tools-called:', steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)))
            for (const step of steps) {
              for (const tr of step.toolResults) {
                const output = tr.output as Record<string, unknown> | undefined
                if (output?.status === 'pending_confirmation') {
                  pendingAction = {
                    tool: 'set_budget',
                    params: { monthly_limit_inr: output.monthly_limit_inr as number },
                  }
                } else if (output?.status === 'pending_swiggy_log') {
                  const o = output.order as Record<string, unknown>
                  pendingAction = {
                    tool: 'log_swiggy_order',
                    params: {
                      order_id: o.order_id as string,
                      restaurant_name: o.restaurant_name as string,
                      amount: o.amount as number,
                      payment_method: o.payment_method as string,
                      items_display: o.items_display as string,
                    },
                  }
                }
              }
            }

            const response = await streamResult.response
            const usage = await streamResult.usage
            captureCompletion({
              userMessage: messages.at(-1)?.content ?? '',
              reply: (await streamResult.text),
              toolsCalled: steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)),
              totalTokens: usage.totalTokens ?? 0,
              latencyMs: Date.now() - t0,
            })
            send({ type: 'response_messages', messages: response.messages })
            if (pendingAction) {
              send({ type: 'pending_action', action: pendingAction })
            }
            send({ type: 'done' })
          } catch (err) {
            send({ type: 'error', message: err instanceof Error ? err.message : 'Stream error' })
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

    // ── Non-streaming path (backward compat) ──
    const result = await generateText({
      model: google(MODEL_ID),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      temperature: 0,
    })

    let pendingAction: PendingWriteAction | null = null
    for (const step of result.steps) {
      for (const tr of step.toolResults) {
        const output = tr.output as Record<string, unknown> | undefined
        if (output?.status === 'pending_confirmation') {
          pendingAction = {
            tool: 'set_budget',
            params: { monthly_limit_inr: output.monthly_limit_inr as number },
          }
        } else if (output?.status === 'pending_swiggy_log') {
          const o = output.order as Record<string, unknown>
          pendingAction = {
            tool: 'log_swiggy_order',
            params: {
              order_id: o.order_id as string,
              restaurant_name: o.restaurant_name as string,
              amount: o.amount as number,
              payment_method: o.payment_method as string,
              items_display: o.items_display as string,
            },
          }
        }
      }
    }

    const toolsCalled = result.steps.flatMap(s => s.toolCalls.map(tc => tc.toolName))
    console.log('agent:steps', result.steps.length, 'tools-called:', toolsCalled)
    captureCompletion({
      userMessage: messages.at(-1)?.content ?? '',
      reply: result.text,
      toolsCalled,
      totalTokens: result.usage.totalTokens ?? 0,
      latencyMs: Date.now() - t0,
    })
    console.timeEnd('agent:total-roundtrip')

    return Response.json({
      reply: result.text,
      responseMessages: result.response.messages,
      pendingAction,
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
      { status: 200 }
    )
  }
}
