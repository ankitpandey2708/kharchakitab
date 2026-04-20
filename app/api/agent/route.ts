import { generateText, streamText, stepCountIs } from 'ai'
import { createAgentTools } from '@/src/lib/agent/tools'
import { SYSTEM_PROMPT, resolveModelId, getGoogleProvider } from '@/src/lib/agent/config'
import type { DataSnapshot, PendingWriteAction } from '@/src/lib/agent/types'

const google = getGoogleProvider()
const MODEL_ID = resolveModelId()

export async function POST(request: Request) {
  console.time('agent:total-roundtrip')

  try {
    const { messages, snapshot, stream: wantStream }: {
      messages: any[]
      snapshot: DataSnapshot
      stream?: boolean
    } = await request.json()

    const tools = createAgentTools(snapshot)

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
            for (const step of steps) {
              for (const tr of step.toolResults) {
                const output = tr.output as Record<string, unknown> | undefined
                if (output && output.status === 'pending_confirmation') {
                  pendingAction = {
                    tool: 'set_budget',
                    params: { monthly_limit_inr: output.monthly_limit_inr as number },
                  }
                }
              }
            }

            const response = await streamResult.response
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
        if (output && output.status === 'pending_confirmation') {
          pendingAction = {
            tool: 'set_budget',
            params: { monthly_limit_inr: output.monthly_limit_inr as number },
          }
        }
      }
    }

    console.log('agent:steps', result.steps.length, 'tools-called:', result.steps.flatMap(s => s.toolCalls.map(tc => tc.toolName)))
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
