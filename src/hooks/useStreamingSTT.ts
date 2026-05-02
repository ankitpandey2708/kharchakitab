"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { SIGNALING_URL } from "@/src/config/sync"

const CHUNK_INTERVAL_MS = 250 // Send audio every 250ms
const SAMPLE_RATE = 16000

interface StreamingSTTResult {
  /** Latest transcript from Sarvam */
  transcript: string
  /** Detected language code (BCP-47) */
  languageCode: string | null
  /** True while mic is active and streaming */
  isStreaming: boolean
  /** True when user is actively speaking (via VAD) */
  isUserSpeaking: boolean
  /** Error message if something failed */
  error: string | null
  /** Start streaming: opens mic + WebSocket */
  start: () => Promise<void>
  /** Stop streaming: closes mic + WebSocket, returns final transcript */
  stop: () => Promise<string>
  /** Send flush signal to finalize partial transcripts */
  flush: () => void
}

/**
 * Hook that streams mic audio to Sarvam's WebSocket STT API in real-time.
 * Receives partial transcripts and VAD events (START_SPEECH / END_SPEECH).
 *
 * Connects via the signaling server (server.ts) which proxies to Sarvam
 * with the Api-Subscription-Key header. Browser WS API cannot send custom
 * headers, so this server-side relay is required.
 */
export function useStreamingSTT({
  mode = "translate",
  onEndOfSpeech,
  onStartOfSpeech,
}: {
  mode?: "transcribe" | "translate" | "verbatim" | "translit" | "codemix"
  onEndOfSpeech?: (transcript: string) => void
  onStartOfSpeech?: () => void
} = {}): StreamingSTTResult {
  const [transcript, setTranscript] = useState("")
  const [languageCode, setLanguageCode] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null)
  const chunkBufferRef = useRef<Float32Array[]>([])
  const intervalRef = useRef<number | null>(null)
  const transcriptRef = useRef("")
  const stopResolveRef = useRef<((transcript: string) => void) | null>(null)
  const stopTimeoutRef = useRef<number | null>(null)
  const hasSpeechStartedRef = useRef(false)
  const pendingEndOfSpeechRef = useRef(false)
  const serverClosedRef = useRef(false)

  // Keep callbacks in refs to avoid stale closures
  const onEndOfSpeechRef = useRef(onEndOfSpeech)
  const onStartOfSpeechRef = useRef(onStartOfSpeech)
  useEffect(() => { onEndOfSpeechRef.current = onEndOfSpeech }, [onEndOfSpeech])
  useEffect(() => { onStartOfSpeechRef.current = onStartOfSpeech }, [onStartOfSpeech])

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close()
      }
      wsRef.current = null
    }
    if (stopTimeoutRef.current) {
      clearTimeout(stopTimeoutRef.current)
      stopTimeoutRef.current = null
    }
    chunkBufferRef.current = []
    setIsStreaming(false)
    setIsUserSpeaking(false)
  }, [])

  /** Convert Float32 samples to 16-bit PCM and then to base64 */
  const encodeChunk = useCallback((samples: Float32Array): string => {
    const buffer = new ArrayBuffer(samples.length * 2)
    const view = new DataView(buffer)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
    const bytes = new Uint8Array(buffer)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }, [])

  /** Downsample from source rate to target rate */
  const downsample = useCallback((samples: Float32Array, sourceRate: number, targetRate: number): Float32Array => {
    if (sourceRate === targetRate) return samples
    const ratio = sourceRate / targetRate
    const newLength = Math.round(samples.length / ratio)
    const result = new Float32Array(newLength)
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.round(i * ratio)
      result[i] = samples[Math.min(srcIndex, samples.length - 1)]
    }
    return result
  }, [])

  /** Send buffered audio chunks to Sarvam WebSocket */
  const sendChunks = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      chunkBufferRef.current = []
      return
    }
    const chunks = chunkBufferRef.current
    if (chunks.length === 0) return

    // Merge all buffered chunks
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    chunkBufferRef.current = []

    // Downsample to 16kHz if needed
    const sourceRate = audioCtxRef.current?.sampleRate ?? 48000
    const downsampled = downsample(merged, sourceRate, SAMPLE_RATE)
    const base64 = encodeChunk(downsampled)

    ws.send(JSON.stringify({
      audio: {
        data: base64,
        sample_rate: String(SAMPLE_RATE),
        encoding: "audio/wav",
      },
    }))
  }, [downsample, encodeChunk])

  const flush = useCallback(() => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendChunks()
      ws.send(JSON.stringify({ type: "flush" }))
    }
  }, [sendChunks])

  const stop = useCallback(async (): Promise<string> => {
    return new Promise<string>((resolve) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        cleanup()
        resolve(transcriptRef.current)
        return
      }
      // Send remaining audio + flush, then wait for final transcript
      sendChunks()
      wsRef.current.send(JSON.stringify({ type: "flush" }))
      stopResolveRef.current = resolve

      // Safety timeout: if server doesn't close connection or send transcript
      // within reasonable time, resolve with current transcript
      stopTimeoutRef.current = window.setTimeout(() => {
        if (stopResolveRef.current) {
          console.warn("[StreamingSTT] Stop timeout fired without receiving final transcript from server")
          stopResolveRef.current(transcriptRef.current)
          stopResolveRef.current = null
        }
        // Tell server to close the Sarvam proxy
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: "stt:stop" }))
        }
        cleanup()
      }, 3000)

      // Tell server to close the Sarvam proxy - this will trigger stt:closed
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "stt:stop" }))
      }
    })
  }, [cleanup, sendChunks])

  const startAudioCapture = useCallback(async (stream: MediaStream) => {
    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx

    try {
      // Load the modern AudioWorklet module
      await audioCtx.audioWorklet.addModule('/worklets/stt-processor.js')
      const source = audioCtx.createMediaStreamSource(stream)
      
      const processor = new AudioWorkletNode(audioCtx, 'stt-processor')
      processorRef.current = processor

      processor.port.onmessage = (e) => {
        const input = e.data as Float32Array
        chunkBufferRef.current.push(new Float32Array(input))
      }

      source.connect(processor)
      // AudioWorkletNode stays active as long as it's connected to the graph
      processor.connect(audioCtx.destination)
    } catch (err) {
      console.warn("[StreamingSTT] Failed to load AudioWorklet, falling back to ScriptProcessorNode:", err)
      
      const source = audioCtx.createMediaStreamSource(stream)
      // Fallback for older browsers or if module loading fails
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        chunkBufferRef.current.push(new Float32Array(input))
      }

      source.connect(processor)
      const silencer = audioCtx.createGain()
      silencer.gain.value = 0
      processor.connect(silencer)
      silencer.connect(audioCtx.destination)
    }

    // Send chunks at regular intervals
    intervalRef.current = window.setInterval(sendChunks, CHUNK_INTERVAL_MS)
  }, [sendChunks])

  const start = useCallback(async () => {
    setError(null)
    setTranscript("")
    setLanguageCode(null)
    transcriptRef.current = ""
    hasSpeechStartedRef.current = false
    pendingEndOfSpeechRef.current = false
    serverClosedRef.current = false

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported on this device.")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Connect to signaling server — it proxies to Sarvam with auth headers
      console.log("[StreamingSTT] Connecting to signaling server:", SIGNALING_URL)
      const ws = new WebSocket(SIGNALING_URL)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("[StreamingSTT] Connected, requesting STT proxy")
        ws.send(JSON.stringify({
          type: "stt:start",
          payload: { mode, sample_rate: String(SAMPLE_RATE), input_audio_codec: "pcm_s16le" },
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          console.log("[StreamingSTT] Received message from server:", msg.type, msg)

          // Server confirms Sarvam connected — start audio capture
          if (msg.type === "stt:ready") {
            console.log("[StreamingSTT] Sarvam proxy ready, starting audio capture")
            setIsStreaming(true)
            void startAudioCapture(stream)
            return
          }

          if (msg.type === "stt:closed") {
            console.log("[StreamingSTT] Sarvam proxy closed by server")
            serverClosedRef.current = true
            if (stopTimeoutRef.current) {
              clearTimeout(stopTimeoutRef.current)
              stopTimeoutRef.current = null
            }
            if (stopResolveRef.current) {
              stopResolveRef.current(transcriptRef.current)
              stopResolveRef.current = null
            }
            cleanup()
            return
          }

          if (msg.type === "data" && msg.data?.transcript) {
            const text = msg.data.transcript
            transcriptRef.current = text
            setTranscript(text)
            if (msg.data.language_code) {
              setLanguageCode(msg.data.language_code)
            }

            // If we're stopping and got a transcript after flush, resolve
            if (stopResolveRef.current) {
              stopResolveRef.current(text)
              stopResolveRef.current = null
            }

            // END_SPEECH fired before this transcript arrived — deliver now
            if (pendingEndOfSpeechRef.current) {
              pendingEndOfSpeechRef.current = false
              onEndOfSpeechRef.current?.(text)
            }
          }

          if (msg.type === "events" && msg.data?.signal_type) {
            if (msg.data.signal_type === "START_SPEECH") {
              hasSpeechStartedRef.current = true
              setIsUserSpeaking(true)
              onStartOfSpeechRef.current?.()
            } else if (msg.data.signal_type === "END_SPEECH") {
              if (!hasSpeechStartedRef.current) return
              hasSpeechStartedRef.current = false
              setIsUserSpeaking(false)
              if (transcriptRef.current.trim()) {
                // Transcript already arrived before END_SPEECH
                onEndOfSpeechRef.current?.(transcriptRef.current)
              } else {
                // Transcript hasn't arrived yet — deliver when it does
                pendingEndOfSpeechRef.current = true
              }
            }
          }

          if (msg.type === "error") {
            const errData = msg.data || msg.payload
            console.error("[StreamingSTT] Server error:", errData)
            setError(errData?.error || errData?.message || "STT error")
          }
        } catch (err) {
          console.error("[StreamingSTT] Failed to parse message from server:", event.data, err)
        }
      }

      ws.onerror = () => {
        console.error("[StreamingSTT] WebSocket error connecting to signaling server")
      }

      ws.onclose = (e) => {
        if (!e.wasClean && !serverClosedRef.current) {
          setError(`Speech service connection failed (code: ${e.code})`)
        }
        if (stopResolveRef.current) {
          stopResolveRef.current(transcriptRef.current)
          stopResolveRef.current = null
        }
        cleanup()
      }
    } catch (err) {
      console.error("[StreamingSTT] Start failed:", err)
      setError(err instanceof Error ? err.message : "Failed to start streaming STT")
      cleanup()
    }
  }, [mode, cleanup, startAudioCapture])

  // Cleanup on unmount
  useEffect(() => {
    return () => { cleanup() }
  }, [cleanup])

  return {
    transcript,
    languageCode,
    isStreaming,
    isUserSpeaking,
    error,
    start,
    stop,
    flush,
  }
}
