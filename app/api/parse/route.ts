import { NextRequest, NextResponse } from "next/server";
import { getPostHogClient } from "@/src/lib/posthog-server";
import { getMannKiBaatPrompt, MANN_KI_BAAT_TYPE_INSTRUCTIONS, getSystemPrompt } from "@/src/utils/prompts";
import { formatDateYMD } from "@/src/utils/dates";
import { ExpenseArraySchema } from "@/src/utils/schemas";
import type { CurrencyCode } from "@/src/utils/money";
import { isOnCooldown, setCooldown, geminiKey, extractRateLimit } from "@/src/lib/providers/circuit-breaker";
import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { CLAUDE_OAUTH_MODEL, CLAUDE_SYSTEM_PROMPT_PREFIX } from "@/src/lib/claude/oauth";
import { getFreshClaudeToken, setClaudeRefreshedCookies } from "@/src/lib/claude/client";

type TierOutcome = "success" | "timeout" | "rate_limit" | "schema_fail" | "transport_error" | "truncation" | "cancelled";

interface TierResult {
  text?: string;
  outcome: TierOutcome;
  latency_ms: number;
  output_tokens?: number;
  truncated?: boolean;
  error?: string;
}

const GEMINI_TIMEOUT_MS = 8000;

const GEMINI_MODELS = (process.env.GEMINI_MODEL || "")
  .split(",").map((m) => m.trim()).filter(Boolean);

function modelLabel(model: string): string {
  return model.split("/").pop()!;
}

function resolveOutcome(result: TierResult, parsed: unknown): TierOutcome {
  return parsed !== null ? result.outcome : result.outcome === "success" ? "schema_fail" : result.outcome;
}

function tryParseJSON(raw: string): unknown | null {
  try { return JSON.parse(raw); } catch { void 0; }
  const stripped = raw.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try { return JSON.parse(stripped); } catch { void 0; }
  const objMatch = stripped.match(/(\{[\s\S]*\})/);
  if (objMatch) try { return JSON.parse(objMatch[1]); } catch { void 0; }
  const arrMatch = stripped.match(/(\[[\s\S]*\])/);
  if (arrMatch) try { return JSON.parse(arrMatch[1]); } catch { void 0; }
  return null;
}

// Gemini-compatible JSON schema for the expense array (OpenAPI 3.0 subset)
const EXPENSE_GEMINI_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      amount: { type: "number", description: "The cost in numbers only" },
      category: { type: "string", description: "One word category e.g. Food, Travel" },
      item: { type: "string", description: "Short description of item" },
      date: { type: "string", description: "Date in YYYY-MM-DD format" },
      paymentMethod: { type: "string", enum: ["cash", "upi", "card"] },
      confidence: { type: "number", description: "Confidence score 0-1" },
      recurring: { type: "boolean" },
      frequency: { type: "string", enum: ["monthly", "quarterly", "yearly"] },
      templateId: { type: "string", nullable: true },
    },
    required: ["amount", "category", "item", "date"],
  },
};

function mergeSignals(internal: AbortSignal, external?: AbortSignal): AbortSignal {
  if (!external) return internal;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([internal, external]);
  const merged = new AbortController();
  const abort = () => merged.abort();
  internal.addEventListener("abort", abort, { once: true });
  external.addEventListener("abort", abort, { once: true });
  return merged.signal;
}

async function callGemini(
  text: string,
  model: string,
  temperature: number,
  requestType: string,
  cancelSignal?: AbortSignal,
): Promise<TierResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { outcome: "transport_error", latency_ms: 0, error: "Gemini API key not configured." };

  const isGemma = model.includes("gemma");
  const isExpense = requestType === "expense";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`;

  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), GEMINI_TIMEOUT_MS);
  const signal = mergeSignals(timeoutCtrl.signal, cancelSignal);
  const t0 = Date.now();

  console.log(`[AI] gemini: sending request (model=${model}, temp=${temperature}, timeout=${GEMINI_TIMEOUT_MS}ms)`);

  try {
    const generationConfig: Record<string, unknown> = {
      temperature,
      maxOutputTokens: isExpense ? 1024 : 512,
      ...(!isGemma && {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "MINIMAL" },
        ...(isExpense && { responseSchema: EXPENSE_GEMINI_SCHEMA }),
      }),
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig,
      }),
    });

    const latency_ms = Date.now() - t0;
    console.log(`[AI] gemini: response status=${response.status} ttfb=${latency_ms}ms`);

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const msg = errBody?.error?.message ?? `Gemini error ${response.status}`;
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get("retry-after") ?? "", 10);
        setCooldown(geminiKey(model), isNaN(retryAfter) ? 60 : retryAfter);
        console.log(`[AI] gemini: rate_limit model=${model} — ${msg}`);
        return { outcome: "rate_limit", latency_ms, error: msg };
      }
      console.log(`[AI] gemini: error status=${response.status} after ${latency_ms}ms — ${msg}`);
      return { outcome: "transport_error", latency_ms, error: msg };
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: { candidatesTokenCount?: number };
    };

    const latency_total = Date.now() - t0;
    const finishReason = data.candidates?.[0]?.finishReason;
    const output_tokens = data.usageMetadata?.candidatesTokenCount;
    const truncated = finishReason === "MAX_TOKENS";

    console.log(`[AI] gemini: parsed total=${latency_total}ms finishReason=${finishReason} tokens=${output_tokens}`);

    let out = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (out) out = out.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    if (!out) return { outcome: "transport_error", latency_ms: latency_total, output_tokens, error: "Empty response from Gemini." };

    return { outcome: truncated ? "truncation" : "success", latency_ms: latency_total, output_tokens, truncated, text: out };
  } catch (e) {
    const latency_ms = Date.now() - t0;
    if (e instanceof Error && e.name === "AbortError") {
      if (cancelSignal?.aborted) {
        console.log(`[AI] gemini: cancelled model=${model} after ${latency_ms}ms`);
        return { outcome: "cancelled", latency_ms };
      }
      console.log(`[AI] gemini: timeout model=${model} after ${latency_ms}ms`);
      return { outcome: "timeout", latency_ms, error: `Timeout after ${GEMINI_TIMEOUT_MS}ms` };
    }
    console.log(`[AI] gemini: exception after ${latency_ms}ms — ${e instanceof Error ? e.message : e}`);
    return { outcome: "transport_error", latency_ms, error: e instanceof Error ? e.message : "Network error reaching Gemini." };
  } finally {
    clearTimeout(timer);
  }
}

async function callClaude(
  text: string,
  token: string,
  temperature: number,
  cancelSignal?: AbortSignal,
): Promise<TierResult> {
  const t0 = Date.now();
  const timeoutCtrl = new AbortController();
  const timer = setTimeout(() => timeoutCtrl.abort(), 10000);
  const signal = mergeSignals(timeoutCtrl.signal, cancelSignal);

  try {
    const anthropic = createAnthropic({
      authToken: token,
      headers: { "anthropic-beta": "oauth-2025-04-20,claude-code-20250219" },
    });
    const result = await generateText({
      model: anthropic(CLAUDE_OAUTH_MODEL) as unknown as Parameters<typeof generateText>[0]['model'],
      // Claude OAuth requires the system prompt to start with the Claude Code prefix
      prompt: `${CLAUDE_SYSTEM_PROMPT_PREFIX}\n\n${text}`,
      temperature,
      maxOutputTokens: 1024,
      abortSignal: signal,
    });

    const latency_ms = Date.now() - t0;
    const truncated = result.finishReason === "length";
    const output_tokens = result.usage?.outputTokens;
    console.log(`[AI] claude: success total=${latency_ms}ms finishReason=${result.finishReason} tokens=${output_tokens}`);
    if (!result.text) return { outcome: "transport_error", latency_ms, output_tokens, error: "Empty response from Claude." };
    return { outcome: truncated ? "truncation" : "success", latency_ms, output_tokens, truncated, text: result.text };
  } catch (e) {
    const latency_ms = Date.now() - t0;
    if (e instanceof Error && e.name === "AbortError") {
      if (cancelSignal?.aborted) return { outcome: "cancelled", latency_ms };
      return { outcome: "timeout", latency_ms, error: "Timeout after 10000ms" };
    }
    const { isRateLimit } = extractRateLimit(e);
    if (isRateLimit) {
      console.log(`[AI] claude: rate_limit — ${e instanceof Error ? e.message : e}`);
      return { outcome: "rate_limit", latency_ms, error: e instanceof Error ? e.message : "Rate limited" };
    }
    console.log(`[AI] claude: exception after ${latency_ms}ms — ${e instanceof Error ? e.message : e}`);
    return { outcome: "transport_error", latency_ms, error: e instanceof Error ? e.message : "Network error reaching Claude." };
  } finally {
    clearTimeout(timer);
  }
}

function validateAndParse(result: TierResult, requestType: string): unknown | null {
  if (result.outcome !== "success" && result.outcome !== "truncation") return null;
  if (!result.text) return null;
  if (requestType !== "mann-ki-baat") {
    let p = tryParseJSON(result.text);
    if (p !== null && !Array.isArray(p)) p = [p];
    const v = ExpenseArraySchema.safeParse(p);
    return v.success ? v.data : null;
  }
  return tryParseJSON(result.text) ?? result.text;
}

function geminiPrompt(basePrompt: string, model: string): string {
  return model.includes("gemma")
    ? `${basePrompt}\n\nIMPORTANT: Respond with ONLY valid JSON. No markdown, no explanation, no code fences.`
    : basePrompt;
}

function recordTier(
  telemetry: Record<string, unknown>,
  tierKey: string,
  result: TierResult,
  outcome: TierOutcome,
) {
  telemetry[`${tierKey}_outcome`] = outcome;
  telemetry[`${tierKey}_latency_ms`] = result.latency_ms;
  if (result.output_tokens !== undefined) telemetry[`${tierKey}_output_tokens`] = result.output_tokens;
  if (result.truncated !== undefined) telemetry[`${tierKey}_truncated`] = result.truncated;
}

// Validate, record telemetry, and return parsed data + provider on success, null on failure.
function accept(
  result: TierResult,
  requestType: string,
  tierKey: string,
  label: string,
  telemetry: Record<string, unknown>,
): { parsed: unknown; provider: string } | null {
  const parsed = validateAndParse(result, requestType);
  recordTier(telemetry, tierKey, result, resolveOutcome(result, parsed));
  return parsed !== null ? { parsed, provider: label } : null;
}

export async function POST(request: NextRequest) {
  const reqStart = Date.now();
  const body = (await request.json()) as { text?: string; type?: string; messageType?: string; currency?: CurrencyCode };
  const text = body.text?.trim();
  const requestType = body.type || "expense";
  if (!text) {
    return NextResponse.json({ error: "Missing text." }, { status: 400 });
  }

  const distinctId = request.headers.get("x-posthog-distinct-id") || "anonymous";
  const posthog = getPostHogClient();

  let basePrompt: string;
  if (requestType === "mann-ki-baat") {
    const typeKey = body.messageType || "roast";
    const typeInstruction = MANN_KI_BAAT_TYPE_INSTRUCTIONS[typeKey] || MANN_KI_BAAT_TYPE_INSTRUCTIONS.roast;
    basePrompt = `${getMannKiBaatPrompt(typeInstruction)}\n\nUser data:\n${text}`;
  } else {
    const systemPrompt = getSystemPrompt(body.currency || "INR");
    const today = formatDateYMD(new Date());
    basePrompt = `${systemPrompt}\nToday: ${today}\nInput: ${text}`;
  }

  const temperature = requestType === "mann-ki-baat" ? 0.7 : 0;
  const telemetry: Record<string, unknown> = { input_length: text.length };
  let finalParsed: unknown = null;
  let provider = "unknown";
  // Track refreshed Claude tokens for the response
  let responseTokens: { accessToken: string; refreshToken: string; expiresIn: number } | null = null;

  const [model1, model2] = GEMINI_MODELS;
  let tierN = 0;
  const nextTier = () => `tier${++tierN}`;

  // ── Claude OAuth first (user's own subscription, highest priority) ──
  const { token: claudeToken, refreshedTokens } = await getFreshClaudeToken();
  if (claudeToken) {
    responseTokens = refreshedTokens ?? null;
    const win = accept(
      await callClaude(basePrompt, claudeToken, temperature),
      requestType, nextTier(), "claude", telemetry,
    );
    if (win) { finalParsed = win.parsed; provider = win.provider; }
  }

  // --- Gemini sequential fallback ---
  if (finalParsed === null) {
    for (const m of ([model1, model2].filter(Boolean)) as string[]) {
      if (isOnCooldown(geminiKey(m))) {
        const t = nextTier();
        telemetry[`${t}_outcome`] = "rate_limit_cooldown";
        telemetry[`${t}_latency_ms`] = 0;
        continue;
      }
      const win = accept(
        await callGemini(geminiPrompt(basePrompt, m), m, temperature, requestType),
        requestType, nextTier(), modelLabel(m), telemetry,
      );
      if (win) { finalParsed = win.parsed; provider = win.provider; break; }
    }
  }

  const total_ms = Date.now() - reqStart;

  if (finalParsed === null) {
    const event = requestType === "mann-ki-baat" ? "mann_ki_baat_generate_failed" : "expense_parse_failed";
    posthog?.capture({ distinctId, event, properties: { ...telemetry, provider, total_ms } });
    const errRes = NextResponse.json({ error: "All AI providers failed." }, { status: 502 });
    if (responseTokens) setClaudeRefreshedCookies(errRes, responseTokens);
    return errRes;
  }

  const event = requestType === "mann-ki-baat" ? "mann_ki_baat_generated" : "expense_parsed";
  console.log(`[AI] ${event}: provider=${provider} total=${total_ms}ms`);
  posthog?.capture({ distinctId, event, properties: { ...telemetry, provider, total_ms } });

  const okRes = NextResponse.json({ data: finalParsed });
  if (responseTokens) setClaudeRefreshedCookies(okRes, responseTokens);
  return okRes;
}
