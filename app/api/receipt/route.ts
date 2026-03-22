import { NextRequest, NextResponse } from "next/server";
import { getReceiptPrompt } from "@/src/utils/prompts";
import type { CurrencyCode } from "@/src/utils/money";
import { formatDateYMD } from "@/src/utils/dates";
import { getPostHogClient } from "@/src/lib/posthog-server";

export const runtime = "nodejs";

type AIResult = { text: string } | { error: string };

const GEMINI_MODELS = (process.env.GEMINI_MODEL || "models/gemini-3.1-flash-lite-preview,models/gemma-3-27b-it")
  .split(",").map((m) => m.trim()).filter(Boolean);

async function callGemini(prompt: string, base64: string, mimeType: string, model: string): Promise<AIResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Gemini API key not configured." };
  const isGemma = model.includes("gemma");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;
  console.log(`[AI] gemini: sending request (model=${model}, imageBytes=${Math.round(base64.length * 0.75)})`);
  const t0 = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 256,
          ...(!isGemma && { responseMimeType: "application/json", thinkingConfig: { thinkingLevel: "MINIMAL" } }),
        },
      }),
    });
    const ttfb = Date.now() - t0;
    console.log(`[AI] gemini: response received status=${response.status} ttfb=${ttfb}ms`);
    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = errBody?.error?.message ?? `Gemini error ${response.status}`;
      console.log(`[AI] gemini: error after ${Date.now() - t0}ms — ${msg}`);
      return { error: msg };
    }
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    console.log(`[AI] gemini: body parsed total=${Date.now() - t0}ms`);
    let out = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (out) out = out.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return out ? { text: out } : { error: "Empty response from Gemini." };
  } catch (e) {
    console.log(`[AI] gemini: exception after ${Date.now() - t0}ms — ${e instanceof Error ? e.message : e}`);
    return { error: e instanceof Error ? e.message : "Network error reaching Gemini." };
  }
}

async function callOpenRouterVision(prompt: string, base64: string, mimeType: string): Promise<AIResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { error: "OpenRouter API key not configured." };
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";
  console.log(`[AI] openrouter: sending request (model=${model}, imageBytes=${Math.round(base64.length * 0.75)})`);
  const t0 = Date.now();
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });
    const ttfb = Date.now() - t0;
    const resolvedModel = response.headers.get("x-model-id") ?? response.headers.get("openrouter-model") ?? "unknown";
    const queueTime = response.headers.get("x-queue-time");
    const genTime = response.headers.get("x-generation-time");
    const rateLimit = response.headers.get("x-ratelimit-remaining-requests");
    console.log(`[AI] openrouter: response status=${response.status} ttfb=${ttfb}ms resolved_model=${resolvedModel} queue=${queueTime}ms gen=${genTime}ms rate_limit_remaining=${rateLimit}`);
    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
      const msg = errBody?.error?.message ?? `OpenRouter error ${response.status}`;
      const code = errBody?.error?.code;
      console.log(`[AI] openrouter: FAILED status=${response.status} code=${code} after ${Date.now() - t0}ms — ${msg}`);
      return { error: msg };
    }
    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    console.log(`[AI] openrouter: success model_used=${data.model ?? resolvedModel} total=${Date.now() - t0}ms`);
    const out = data.choices?.[0]?.message?.content;
    return out ? { text: out } : { error: "Empty response from OpenRouter." };
  } catch (e) {
    console.log(`[AI] openrouter: exception after ${Date.now() - t0}ms — ${e instanceof Error ? e.message : e}`);
    return { error: e instanceof Error ? e.message : "Network error reaching OpenRouter." };
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing receipt image." }, { status: 400 });
  }

  const currencyField = formData.get("currency");
  const currencyCode: CurrencyCode = currencyField === "USD" ? "USD" : "INR";

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = file.type || "image/jpeg";
  const today = formatDateYMD(new Date());
  const prompt = `${getReceiptPrompt(currencyCode)}\nToday: ${today}`;

  const distinctId = request.headers.get("x-posthog-distinct-id") || "anonymous";
  const posthog = getPostHogClient();

  const reqStart = Date.now();
  console.log(`[AI] receipt: image=${mimeType} size=${buffer.byteLength}B `);

  let result: AIResult = { error: "No models configured." };
  let provider = "unknown";

  for (const model of GEMINI_MODELS) {
    const label = model.split("/").pop()!;
    const t = Date.now();
    result = await callGemini(prompt, base64, mimeType, model);
    console.log(`[AI] ${label}: total call duration=${Date.now() - t}ms`);
    if (!("error" in result)) { provider = label; break; }
    console.log(`[AI] ${label} failed → next — ${result.error}`);
  }

  // Final fallback: OpenRouter
  if ("error" in result) {
    const t = Date.now();
    result = await callOpenRouterVision(prompt, base64, mimeType);
    console.log(`[AI] openrouter: total call duration=${Date.now() - t}ms`);
    provider = "openrouter";
  }

  if ("error" in result) {
    if (posthog) {
      posthog.capture({
        distinctId,
        event: "receipt_parse_failed",
        properties: { provider, error: result.error, image_size_bytes: buffer.byteLength },
      });
    }
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  if (posthog) {
    posthog.capture({
      distinctId,
      event: "receipt_parsed",
      properties: {
        image_size_bytes: buffer.byteLength,
        image_mime_type: mimeType,
        output_length: result.text.length,
        provider,
      },
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
    if (Array.isArray(parsed)) parsed = parsed[0];
  } catch {
    return NextResponse.json({ error: "Invalid JSON from AI." }, { status: 502 });
  }

  console.log(`[AI] receipt_parsed: provider=${provider} total_request=${Date.now() - reqStart}ms`);
  return NextResponse.json({ data: parsed });
}
