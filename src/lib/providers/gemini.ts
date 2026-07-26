/** Build the Gemini generation endpoint URL for a given model. */
export function geminiEndpoint(model: string): string {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY env var is required')
  return `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${apiKey}`
}

/** Strip markdown fences from a Gemini response text. */
export function cleanGeminiOutput(text: string): string {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
}
