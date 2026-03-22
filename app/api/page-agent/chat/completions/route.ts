import { NextRequest, NextResponse } from "next/server";

const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-3-flash-preview")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Use first model; strip "models/" prefix for OpenAI-compat endpoint
const MODEL = GEMINI_MODELS[0]?.replace(/^models\//, "") ?? "gemini-3-flash-preview";

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json();

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...body, model: MODEL }),
    }
  );

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
