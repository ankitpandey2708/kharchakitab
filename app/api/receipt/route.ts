import { NextRequest, NextResponse } from "next/server";
import { getReceiptPrompt } from "@/src/utils/prompts";
import type { CurrencyCode } from "@/src/utils/money";
import { formatDateYMD } from "@/src/utils/dates";
import { getPostHogClient } from "@/src/lib/posthog-server";
import { ExpenseSchema } from "@/src/utils/schemas";
import { CLAUDE_OAUTH_MODEL, CLAUDE_FETCH_HEADERS } from "@/src/lib/claude/oauth";
import { getAnthropicApiKey, getGeminiApiKey } from "@/src/lib/keys";
import { geminiEndpoint, cleanGeminiOutput } from "@/src/lib/providers/gemini";

export const runtime = "nodejs";

type AIResult = { text: string } | { error: string };

const GEMINI_MODELS = (process.env.GEMINI_MODEL || "")
  .split(",").map((m) => m.trim()).filter(Boolean);

async function callClaudeVision(
  prompt: string,
  base64: string,
  mimeType: string,
  apiKey: string,
): Promise<AIResult> {
  const model = CLAUDE_OAUTH_MODEL;
  const t0 = Date.now();
  console.log(`[AI] claude: sending vision request (model=${model}, imageBytes=${Math.round(base64.length * 0.75)})`);
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        ...CLAUDE_FETCH_HEADERS,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: prompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            ],
          },
        ],
      }),
    });
    const ttfb = Date.now() - t0;
    console.log(`[AI] claude: vision response received status=${response.status} ttfb=${ttfb}ms`);
    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = errBody?.error?.message ?? `Claude error ${response.status}`;
      console.log(`[AI] claude: vision error after ${Date.now() - t0}ms — ${msg}`);
      return { error: msg };
    }
    const data = (await response.json()) as {
      content?: Array<{ text?: string }>;
    };
    const out = data.content?.[0]?.text;
    console.log(`[AI] claude: vision parsed total=${Date.now() - t0}ms`);
    return out ? { text: out } : { error: "Empty response from Claude." };
  } catch (e) {
    console.log(`[AI] claude: vision exception after ${Date.now() - t0}ms — ${e instanceof Error ? e.message : e}`);
    return { error: e instanceof Error ? e.message : "Network error reaching Claude." };
  }
}

async function callGemini(prompt: string, base64: string, mimeType: string, model: string, apiKeyOverride?: string): Promise<AIResult> {
  const apiKey = apiKeyOverride || process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "Gemini API key not configured." };
  const isGemma = model.includes("gemma");
  const endpoint = geminiEndpoint(model, apiKey);
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
    if (out) out = cleanGeminiOutput(out);
    return out ? { text: out } : { error: "Empty response from Gemini." };
  } catch (e) {
    console.log(`[AI] gemini: exception after ${Date.now() - t0}ms — ${e instanceof Error ? e.message : e}`);
    return { error: e instanceof Error ? e.message : "Network error reaching Gemini." };
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

  // ── Resolve API keys ──
  const anthropicApiKey = await getAnthropicApiKey();
  const geminiApiKey = await getGeminiApiKey();

  let result: AIResult = { error: "No models configured." };
  let provider = "unknown";

  // ── Anthropic API key first (user-provided or env, highest priority) ──
  if (anthropicApiKey) {
    result = await callClaudeVision(prompt, base64, mimeType, anthropicApiKey);
    if (!("error" in result)) {
      provider = "claude";
      console.log(`[AI] claude: vision success total=${Date.now() - reqStart}ms`);
    }
  }

  // ── Gemini fallback ──
  if ("error" in result) {
    for (const model of GEMINI_MODELS) {
      const label = model.split("/").pop()!;
      const t = Date.now();
      result = await callGemini(prompt, base64, mimeType, model, geminiApiKey || undefined);
      console.log(`[AI] ${label}: total call duration=${Date.now() - t}ms`);
      if (!("error" in result)) { provider = label; break; }
      console.log(`[AI] ${label} failed → next — ${result.error}`);
    }
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

  // Backfill date server-side before validating
  if (parsed && typeof parsed === "object" && !("date" in parsed)) {
    (parsed as { date?: string }).date = today;
  }

  const validation = ExpenseSchema.safeParse(parsed);
  if (!validation.success) {
    return NextResponse.json({ error: "AI response did not match expected schema." }, { status: 502 });
  }

  console.log(`[AI] receipt_parsed: provider=${provider} total_request=${Date.now() - reqStart}ms`);
  return NextResponse.json({ data: validation.data });
}
