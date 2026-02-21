"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MIC_CONFIG } from "@/src/config/mic";
interface StopResult {
  audioBlob: Blob | null;
  duration: number;
}

export const useAudioRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const lastBlobRef = useRef<Blob | null>(null);
  const lastDurationRef = useRef<number>(0);
  const stopResolveRef = useRef<((value: StopResult) => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserIntervalRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  const clearTimeoutRef = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (analyserIntervalRef.current) {
      window.clearInterval(analyserIntervalRef.current);
      analyserIntervalRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
  };

  const stopRecording = useCallback(async (): Promise<StopResult> => {
    setIsRecording(false);
    clearTimeoutRef();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      const stopPromise = new Promise<StopResult>((resolve) => {
        stopResolveRef.current = resolve;
      });
      mediaRecorderRef.current.stop();
      cleanupStream();
      return stopPromise;
    }

    cleanupStream();
    const fallback = {
      audioBlob: lastBlobRef.current,
      duration: lastDurationRef.current || Date.now() - startTimeRef.current,
    };
    setDuration(fallback.duration);
    return fallback;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setDuration(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported on this device.");
      return;
    }

    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      startTimeRef.current = Date.now();
      setIsRecording(true);
      const handleStreamInactive = () => {
        void stopRecording();
      };
      streamRef.current.addEventListener("inactive", handleStreamInactive);
      streamRef.current.getTracks().forEach((track) => {
        track.onended = () => {
          void stopRecording();
        };
      });

      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      source.connect(analyserRef.current);

      const data = new Uint8Array(analyserRef.current.fftSize);
      analyserIntervalRef.current = window.setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const now = Date.now();
        const threshold = MIC_CONFIG.silenceThreshold;
        // Only enable silence detection after 2 seconds of recording
        const recordingDuration = now - startTimeRef.current;
        if (rms < threshold && recordingDuration > 2000) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = now;
          } else if (now - silenceStartRef.current > MIC_CONFIG.silenceDurationMs) {
            void stopRecording();
          }
        } else {
          silenceStartRef.current = null;
        }
      }, MIC_CONFIG.sampleIntervalMs);

      const recorder = new MediaRecorder(streamRef.current);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob =
          chunksRef.current.length > 0
            ? new Blob(chunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            })
            : null;
        const durationMs = Date.now() - startTimeRef.current;
        clearTimeoutRef();
        setAudioBlob(blob);
        setDuration(durationMs);
        setIsRecording(false);
        lastBlobRef.current = blob;
        lastDurationRef.current = durationMs;
        if (stopResolveRef.current) {
          stopResolveRef.current({ audioBlob: blob, duration: durationMs });
          stopResolveRef.current = null;
        }
      };

      try {
        recorder.start();
        mediaRecorderRef.current = recorder;
      } catch (recorderErr) {
        setError("Failed to start recording. Please try again.");
        cleanupStream();
        setIsRecording(false);
        return;
      }

      timeoutRef.current = window.setTimeout(() => {
        void stopRecording();
      }, MIC_CONFIG.hardTimeoutMs);

    } catch (err) {
      setError("Microphone permission denied. Please allow access.");
      setIsRecording(false);
    }
  }, [stopRecording]);

  // Cleanup on unmount to prevent microphone staying active
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      cleanupStream();
    };
  }, []);

  return useMemo(
    () => ({
      isRecording,
      audioBlob,
      duration,
      error,
      startRecording,
      stopRecording,
    }),
    [isRecording, audioBlob, duration, error, startRecording, stopRecording]
  );
};
