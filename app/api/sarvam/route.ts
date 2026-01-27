import { NextRequest, NextResponse } from "next/server";
import { rateLimitByIp } from "@/src/lib/ratelimit";

const SARVAM_ENDPOINT = "https://api.sarvam.ai/speech-to-text-translate";

export async function POST(request: NextRequest) {
  const limit = await rateLimitByIp(request, {
    prefix: "sarvam",
    // Sample alternatives:
    // Hourly: window "1 h", max "60" (avg 1/min)
    // Daily: window "24 h", max "300" (avg 12.5/hour)
    max: Number("6"),
    window: "60 s"
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason ?? "Too many requests." },
      {
        status: limit.skipped ? 500 : 429,
        headers: limit.retryAfter
          ? { "Retry-After": String(limit.retryAfter) }
          : undefined,
      }
    );
  }

  const apiKey = process.env.SARVAM_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing SARVAM_KEY." }, { status: 500 });
  }

  const incoming = await request.formData();
  const file = incoming.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing audio file." }, { status: 400 });
  }
  const buffer = await file.arrayBuffer();
  const normalizedFile = new File([buffer], "audio.webm", {
    type: "audio/webm",
  });

  const formData = new FormData();
  formData.append("file", normalizedFile, "audio.webm");
  formData.append("model", "saaras:v2.5");

  const response = await fetch(SARVAM_ENDPOINT, {
    method: "POST",
    headers: {
      "api-subscription-key": apiKey,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      {
        error: "Sarvam transcription failed.",
        upstreamStatus: response.status,
        upstreamBody: errorText.slice(0, 1000),
      },
      { status: 502 }
    );
  }

  const data = (await response.json()) as { text?: string; transcript?: string };
  return NextResponse.json({ text: data.text || data.transcript || "" });
}
