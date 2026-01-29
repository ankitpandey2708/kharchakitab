import { NextRequest, NextResponse } from "next/server";
import { getPostHogClient } from "@/src/lib/posthog-server";

const GEMINI_MODEL = "models/gemini-3-flash-preview";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY." }, { status: 500 });
  }

  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text }],
        },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: "Gemini request failed." }, { status: 502 });
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  // Track successful expense parsing server-side
  const distinctId = request.headers.get("x-posthog-distinct-id") || "anonymous";
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId,
    event: "expense_parsed",
    properties: {
      input_length: text.length,
      output_length: rawText.length,
    },
  });

  return NextResponse.json({ text: rawText });
}
