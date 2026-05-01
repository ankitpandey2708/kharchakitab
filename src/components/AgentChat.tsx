"use client"
console.log("[AgentChat] v2.1 Loaded")

import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Send, Check, XIcon, Sparkles, Volume2, ShoppingBag } from "lucide-react"
import { RecordingPill } from "@/src/components/RecordingPill"
import { addTransaction } from "@/src/db/db"
import { SERVICE_CATEGORY } from "@/src/lib/swiggy/client"
import { buildSnapshot } from "@/src/lib/agent/snapshot"
import { useStreamingSTT } from "@/src/hooks/useStreamingSTT"
import type { PendingWriteAction, DataSnapshot } from "@/src/lib/agent/types"
import { LS } from "@/src/config/storageKeys"

interface DisplayMessage {
  role: "user" | "assistant"
  text: string
  /** true while text is still streaming in */
  streaming?: boolean
  /** true if this response has TTS audio playing */
  audioPlaying?: boolean
}

const SUGGESTIONS = [
  "How much did I spend this month?",
  "Am I within my budget?",
  "What are my top expenses?",
  "Set my monthly budget",
]

interface AgentChatProps {
  open: boolean
  onClose: () => void
  onRefreshTransactions?: () => void
}

export function AgentChat({ open, onClose, onRefreshTransactions }: AgentChatProps) {
  const [messages, setMessages] = useState<any[]>([])
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([])
  const [pendingActions, setPendingActions] = useState<PendingWriteAction[]>([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState("")

  const scrollRef = useRef<HTMLDivElement>(null)
  const lastSnapshotRef = useRef<DataSnapshot | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // TTS playback state
  const audioCtxRef = useRef<AudioContext | null>(null)
  const audioQueueRef = useRef<AudioBuffer[]>([])
  const isPlayingRef = useRef(false)
  const ttsCancelledRef = useRef(false)
  const [audioPlaying, setAudioPlaying] = useState(false)

  // Refs for streaming STT callbacks (wired after send/stopTTS are defined)
  const sendVoiceRef = useRef<(text: string) => void>(() => {})
  const bargeInRef = useRef<() => void>(() => {})

  // Streaming STT for voice input — replaces batch useAudioRecorder + transcribeAudio
  const streamingSTT = useStreamingSTT({
    onEndOfSpeech: useCallback((transcript: string) => {
      console.log("[AgentChat] END_SPEECH, transcript:", transcript)
      const trimmed = transcript.trim()
      if (trimmed) sendVoiceRef.current(trimmed)
    }, []),
    onStartOfSpeech: useCallback(() => {
      console.log("[AgentChat] START_SPEECH — barge-in")
      bargeInRef.current()
    }, []),
  })

  useEffect(() => {
    const t = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight
      }
    }, 50)
    return () => clearTimeout(t)
  }, [displayMessages, loading, pendingActions])

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // ── TTS helpers (HTTP streaming via /api/tts) ──

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }, [])

  const stopTTS = useCallback(() => {
    ttsCancelledRef.current = true
    // Stop audio playback
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    audioQueueRef.current = []
    isPlayingRef.current = false
    setAudioPlaying(false)
  }, [])

  const playNextChunk = useCallback(async () => {
    if (isPlayingRef.current || ttsCancelledRef.current) return
    const buffer = audioQueueRef.current.shift()
    if (!buffer) return
    isPlayingRef.current = true
    setAudioPlaying(true)
    try {
      const ctx = getAudioContext()
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        isPlayingRef.current = false
        if (audioQueueRef.current.length > 0 && !ttsCancelledRef.current) {
          playNextChunk()
        } else {
          setAudioPlaying(false)
        }
      }
      source.start()
    } catch {
      isPlayingRef.current = false
      setAudioPlaying(false)
    }
  }, [getAudioContext])

  // Track detected language from STT for TTS matching
  const detectedLangRef = useRef<string | null>(null)

  /** Fetch TTS audio for a sentence via HTTP streaming and enqueue for playback */
  const speakSentence = useCallback(async (text: string) => {
    if (ttsCancelledRef.current || !text.trim()) return
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: detectedLangRef.current || "hi-IN" }),
      })
      if (!res.ok || !res.body) {
        const errBody = await res.text()
        console.error("[AgentChat] TTS fetch failed:", res.status, errBody)
        return
      }

      // Read the full audio response and decode it
      const arrayBuffer = await res.arrayBuffer()
      if (ttsCancelledRef.current) return
      const ctx = getAudioContext()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
      if (ttsCancelledRef.current) return
      audioQueueRef.current.push(audioBuffer)
      if (!isPlayingRef.current) playNextChunk()
    } catch {
      // TTS failed for this sentence — skip silently
    }
  }, [getAudioContext, playNextChunk])

  // ── Sentence detection for pipelining ──

  const isSentenceEnd = useCallback((text: string): boolean => {
    return /[.!?।]\s*$/.test(text)
  }, [])

  async function sendSilent(text: string) {
    setLoading(true)
    try {
      const snapshot = await buildSnapshot()
      lastSnapshotRef.current = snapshot

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: text }],
          snapshot,
        }),
      })
      const { reply, responseMessages, pendingActions: pas } = await res.json()

      setMessages(prev => [...prev, { role: "user", content: text }, ...responseMessages])
      setDisplayMessages(prev => [...prev, { role: "assistant", text: reply }])
      setPendingActions(pas ?? [])
    } catch {
      setDisplayMessages(prev => [...prev, { role: "assistant", text: "Something went wrong, try again." }])
    } finally {
      setLoading(false)
    }
  }

  async function send(text: string, isVoice = false) {
    if (!text.trim() || loading) return
    setLoading(true)
    setInput("")
    setDisplayMessages(prev => [...prev, { role: "user", text }])

    const abort = new AbortController()
    abortRef.current = abort
    const sendStart = performance.now()
    let ttftRecorded = false

    try {
      const snapshot = await buildSnapshot()
      lastSnapshotRef.current = snapshot

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, { role: "user", content: text }],
          snapshot,
          stream: true,
        }),
        signal: abort.signal,
      })

      console.log("[AgentChat] LLM request sent, status:", res.status)

      // Check if response is streaming (Phase B) or JSON (fallback)
      const contentType = res.headers.get("content-type") || ""
      console.log("[AgentChat] Response content-type:", contentType)

      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        // Streaming response with optional TTS pipelining
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let fullText = ""
        let sentenceBuffer = ""
        let responseMessages: any[] = []
        let pa: PendingWriteAction[] = []

        // Reset TTS cancel flag for voice-initiated queries
        if (isVoice) {
          ttsCancelledRef.current = false
        }

        // Reset TTS cancel flag for voice-initiated queries
        if (isVoice) {
          ttsCancelledRef.current = false
        }

        // Add streaming placeholder
        console.log("[AgentChat] Adding streaming placeholder message")
        setDisplayMessages(prev => {
          // Avoid double-adding if the stream is already active (rare race condition)
          if (prev.some(m => m.streaming)) return prev
          return [...prev, { role: "assistant", text: "", streaming: true }]
        })

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            console.log("[AgentChat] LLM stream done. Full text length:", fullText.length)
            break
          }
          const chunk = decoder.decode(value, { stream: true })

          // Parse SSE lines
          const lines = chunk.split("\n")
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === "text") {
                  // Track time to first token
                  if (!ttftRecorded) {
                    ttftRecorded = true
                    const ttft = Math.round(performance.now() - sendStart)
                    console.log("[AgentChat] First token received! TTFT:", ttft)
                    import("posthog-js").then(m => m.default.capture("voice_query_ttft", {
                      ttft_ms: ttft,
                      is_voice: isVoice,
                    })).catch(() => { })
                  }

                  fullText += parsed.content
                  sentenceBuffer += parsed.content

                  // Update streaming message
                  setDisplayMessages(prev => {
                    const updated = [...prev]
                    // Find the LAST message with streaming: true
                    const lastStreamingIdx = updated.findLastIndex(m => m.streaming === true)
                    if (lastStreamingIdx !== -1) {
                      updated[lastStreamingIdx] = { ...updated[lastStreamingIdx], text: fullText }
                    } else {
                      console.warn("[AgentChat] Could not find streaming message to update")
                    }
                    return updated
                  })

                  // Send complete sentences to TTS (fire-and-forget, pipelined)
                  if (isVoice && isSentenceEnd(sentenceBuffer)) {
                    console.log("[AgentChat] Sentence detected for TTS:", sentenceBuffer)
                    speakSentence(sentenceBuffer)
                    sentenceBuffer = ""
                  }
                } else if (parsed.type === "response_messages") {
                  responseMessages = parsed.messages
                } else if (parsed.type === "pending_actions") {
                  pa = parsed.actions
                }
              } catch (e) {
                console.warn("[AgentChat] Partial or malformed JSON in stream:", data)
              }
            }
          }
        }

        // Flush remaining text to TTS
        if (isVoice && sentenceBuffer.trim()) {
          speakSentence(sentenceBuffer)
        }

        // Finalize streaming message
        setDisplayMessages(prev => {
          const updated = [...prev]
          const lastIdx = updated.length - 1
          if (lastIdx >= 0 && updated[lastIdx].streaming) {
            updated[lastIdx] = { role: "assistant", text: fullText, streaming: false }
          }
          return updated
        })

        setMessages(prev => [...prev, { role: "user", content: text }, ...responseMessages])
        setPendingActions(pa)
      } else {
        // Fallback: non-streaming JSON response (backward compat)
        const { reply, responseMessages, pendingActions: pas } = await res.json()
        setMessages(prev => [...prev, { role: "user", content: text }, ...responseMessages])
        setDisplayMessages(prev => [...prev, { role: "assistant", text: reply }])
        setPendingActions(pas ?? [])
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setDisplayMessages(prev => [...prev, { role: "assistant", text: "Something went wrong, try again." }])
      }
    } finally {
      const totalLatency = Math.round(performance.now() - sendStart)
      import("posthog-js").then(m => m.default.capture("voice_query_completed", {
        total_latency_ms: totalLatency,
        is_voice: isVoice,
      })).catch(() => { })
      setLoading(false)
      abortRef.current = null
    }
  }

  // ── Wire streaming STT callbacks now that send/stopTTS are defined ──

  useEffect(() => {
    sendVoiceRef.current = (text: string) => {
      // Store detected language from streaming STT for TTS matching
      detectedLangRef.current = streamingSTT.languageCode
      void send(text, true)
    }
  })

  useEffect(() => {
    bargeInRef.current = () => {
      if (audioPlaying || loading) {
        stopTTS()
        if (abortRef.current) {
          abortRef.current.abort()
          abortRef.current = null
        }
        setLoading(false)
        import("posthog-js").then(m => m.default.capture("voice_query_barge_in")).catch(() => {})
      }
    }
  })

  // ── Voice recording handlers ──

  const handleMicTap = useCallback(async () => {
    if (streamingSTT.isStreaming) {
      console.log("[AgentChat] Manual stop triggered")
      // Flush + stop: sends remaining audio, gets final transcript
      const finalTranscript = await streamingSTT.stop()
      // If END_SPEECH already fired this is a no-op (send checks loading state)
      const trimmed = finalTranscript.trim()
      if (trimmed) {
        detectedLangRef.current = streamingSTT.languageCode
        void send(trimmed, true)
      }
    } else {
      // Barge-in: stop TTS + cancel in-flight LLM stream before starting new recording
      if (audioPlaying || loading) {
        stopTTS()
        if (abortRef.current) {
          abortRef.current.abort()
          abortRef.current = null
        }
        setLoading(false)
        try {
          const posthog = (await import("posthog-js")).default
          posthog.capture("voice_query_barge_in")
        } catch { /* posthog unavailable */ }
      }
      await streamingSTT.start()
    }
  }, [streamingSTT, stopTTS, audioPlaying, loading])

  // Cleanup on close/unmount
  useEffect(() => {
    if (!open) {
      stopTTS()
      if (streamingSTT.isStreaming) {
        streamingSTT.stop()
      }
    }
  }, [open, stopTTS, streamingSTT])

  async function handleConfirm(accepted: boolean) {
    const action = pendingActions[0]
    if (!action) return

    if (accepted) {
      if (action.tool === 'set_budget') {
        const snapshot = lastSnapshotRef.current
        if (snapshot) {
          const now = new Date()
          const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
          const amount = action.params.monthly_limit_inr

          if (snapshot.isHousehold) {
            const stored = JSON.parse(localStorage.getItem(LS.BUDGETS_HOUSEHOLD) || "{}")
            stored[mk] = { amount, updated_at: Date.now(), set_by: snapshot.deviceId }
            localStorage.setItem(LS.BUDGETS_HOUSEHOLD, JSON.stringify(stored))
            window.dispatchEvent(new StorageEvent("storage", { key: LS.BUDGETS_HOUSEHOLD }))
          } else {
            const stored = JSON.parse(localStorage.getItem(LS.BUDGETS) || "{}")
            stored[mk] = amount
            localStorage.setItem(LS.BUDGETS, JSON.stringify(stored))
            window.dispatchEvent(new StorageEvent("storage", { key: LS.BUDGETS }))
          }
        }
        setPendingActions(prev => prev.slice(1))
        onRefreshTransactions?.()
        await sendSilent("User confirmed. Budget has been updated to ₹" + action.params.monthly_limit_inr + ".")
      } else if (action.tool === 'log_swiggy_order') {
        const { order_id, restaurant_name, amount, payment_method, items_display, service } = action.params
        await addTransaction({
          id: "",
          amount,
          item: `Swiggy: ${restaurant_name}`,
          category: SERVICE_CATEGORY[service ?? "food"],
          paymentMethod: payment_method === "card" ? "card" : payment_method === "cash" ? "cash" : "upi",
          timestamp: Date.now(),
        })
        const logged = new Set<string>(JSON.parse(localStorage.getItem("swiggy_logged_orders") ?? "[]"))
        logged.add(order_id)
        localStorage.setItem("swiggy_logged_orders", JSON.stringify([...logged]))
        setPendingActions(prev => prev.slice(1))
        onRefreshTransactions?.()
        await sendSilent(`User confirmed. Swiggy order from ${restaurant_name} (${items_display}) for ₹${amount} has been logged as an expense.`)
      }
    } else {
      const declineMsg = action.tool === 'log_swiggy_order'
        ? "User declined logging the Swiggy order."
        : "User declined the budget change."
      setPendingActions(prev => prev.slice(1))
      await sendSilent(declineMsg)
    }
  }

  return (
    <>
      {/* ── Backdrop ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="kk-chat-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* ── Chat Panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="kk-chat-panel"
          >
            {/* Header */}
            <div className="kk-chat-header">
              <div className="kk-chat-header-icon">
                <Sparkles className="w-4 h-4" strokeWidth={2.2} />
              </div>
              <div className="kk-chat-title">
                KharchaKitab
                <span className="kk-chat-title-sub">Your finance assistant</span>
              </div>
              <button
                onClick={onClose}
                className="kk-chat-close"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" strokeWidth={2} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="kk-chat-body">
              {/* Empty state */}
              {displayMessages.length === 0 && !loading && (
                <div className="kk-chat-empty">
                  <p className="kk-chat-empty-greeting">
                    Namaste! 🙏
                  </p>
                  <p className="kk-chat-empty-sub">
                    Ask me about your expenses, budgets, or subscriptions
                  </p>
                  <div className="kk-chat-suggestions">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="kk-chat-suggest-chip"
                        onClick={() => send(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {displayMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.4, 0, 0.2, 1],
                    delay: msg.role === "assistant" ? 0.05 : 0,
                  }}
                  className={`kk-chat-row ${msg.role === "user" ? "kk-chat-row-user" : "kk-chat-row-assistant"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="kk-chat-avatar">
                      <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                    </div>
                  )}
                  <div
                    className={`kk-chat-bubble ${msg.role === "user" ? "kk-chat-bubble-user" : "kk-chat-bubble-assistant"}`}
                  >
                    {msg.text}
                    {msg.streaming && <span className="kk-chat-cursor" />}
                  </div>
                  {msg.role === "assistant" && audioPlaying && i === displayMessages.length - 1 && (
                    <button
                      type="button"
                      onClick={stopTTS}
                      className="kk-chat-audio-indicator"
                      aria-label="Stop audio"
                    >
                      <Volume2 className="w-3 h-3" strokeWidth={2} />
                    </button>
                  )}
                </motion.div>
              ))}

              {/* Loading dots — hide once streaming message appears */}
              {loading && !displayMessages.some(m => m.streaming) && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="kk-chat-row kk-chat-row-assistant"
                >
                  <div className="kk-chat-avatar">
                    <Sparkles className="w-3 h-3" strokeWidth={2.5} />
                  </div>
                  <div className="kk-chat-dots">
                    <span className="kk-chat-dot" />
                    <span className="kk-chat-dot" />
                    <span className="kk-chat-dot" />
                  </div>
                </motion.div>
              )}

              {/* Confirmation Action Sheet */}
              {pendingActions.length > 0 && (
                <motion.div
                  className="kk-chat-confirm-sheet"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }}
                  role="alertdialog"
                  aria-modal="true"
                  aria-labelledby="confirm-label"
                  aria-describedby="confirm-text"
                  onAnimationComplete={() => {
                    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
                  }}
                >
                  <div className="kk-chat-confirm">
                    <div className="kk-chat-confirm-icon">
                      {pendingActions[0].tool === 'log_swiggy_order'
                        ? <ShoppingBag className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
                        : <Sparkles className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />}
                    </div>

                    <p id="confirm-label" className="kk-chat-confirm-label">
                      {pendingActions[0].tool === 'log_swiggy_order' ? 'Log Swiggy Order' : 'Confirm Action'}
                    </p>
                    <p id="confirm-text" className="kk-chat-confirm-text">
                      {pendingActions[0].tool === 'log_swiggy_order'
                        ? pendingActions[0].params.restaurant_name
                        : 'Set monthly budget to'}
                    </p>
                    <div className="kk-chat-confirm-amount" aria-label={`₹${(pendingActions[0].tool === 'log_swiggy_order' ? pendingActions[0].params.amount : pendingActions[0].params.monthly_limit_inr).toLocaleString("en-IN")}`}>
                      ₹{(pendingActions[0].tool === 'log_swiggy_order' ? pendingActions[0].params.amount : pendingActions[0].params.monthly_limit_inr).toLocaleString("en-IN")}
                    </div>

                    <div className="kk-chat-confirm-actions">
                      <button
                        onClick={() => handleConfirm(true)}
                        className="kk-chat-confirm-yes"
                        aria-label="Confirm setting monthly budget"
                      >
                        <span className="kk-btn-icon">
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </span>
                        <span>Confirm</span>
                      </button>
                      <button
                        onClick={() => handleConfirm(false)}
                        className="kk-chat-confirm-no"
                        aria-label="Decline budget change"
                      >
                        <XIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        <span>Decline</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="kk-chat-input-row">
              {streamingSTT.isStreaming ? (
                <RecordingPill
                  isRecording={streamingSTT.isStreaming}
                  isSpeaking={streamingSTT.isUserSpeaking}
                  isProcessing={false}
                  onStopRecording={handleMicTap}
                />
              ) : (
                /* Normal input state */
                <form
                  onSubmit={e => {
                    e.preventDefault()
                    send(input)
                  }}
                  className="kk-chat-input-row"
                  style={{ padding: 0, border: "none", background: "none", backdropFilter: "none", flex: 1 }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Ask about your finances…"
                    disabled={loading}
                    className="kk-chat-input"
                    autoComplete="off"
                  />
                  {input.trim() && (
                    <motion.button
                      type="submit"
                      disabled={loading}
                      className="kk-chat-send"
                      aria-label="Send message"
                      whileTap={{ scale: 0.85 }}
                    >
                      <Send className="w-4 h-4" strokeWidth={2.2} />
                    </motion.button>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
