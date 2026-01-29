import { NextRequest, NextResponse } from "next/server";
import { RECEIPT_PROMPT } from "@/src/utils/prompts";
import { formatDateYMD } from "@/src/utils/dates";
import { getPostHogClient } from "@/src/lib/posthog-server";

export const runtime = "nodejs";

const GEMINI_MODEL = "models/gemini-2.5-flash";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing GEMINI_API_KEY." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing receipt image." }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = file.type || "image/jpeg";
  const today = formatDateYMD(new Date());
  const prompt = `${RECEIPT_PROMPT}\nToday: ${today}`;

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
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
          ],
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

  // Track successful receipt parsing server-side
  const distinctId = request.headers.get("x-posthog-distinct-id") || "anonymous";
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId,
    event: "receipt_parsed",
    properties: {
      image_size_bytes: buffer.byteLength,
      image_mime_type: mimeType,
      output_length: rawText.length,
    },
  });

  return NextResponse.json({ text: rawText });
}
