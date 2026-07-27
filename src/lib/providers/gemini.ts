/** Build the Gemini generation endpoint URL for a given model. */
export function geminiEndpoint(model: string, apiKey?: string): string {
  const key = apiKey || process.env.GEMINI_API_KEY
  if (!key) throw new Error('Gemini API key is required')
  return `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${key}`
}

/** Strip markdown fences from a Gemini response text. */
export function cleanGeminiOutput(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}
