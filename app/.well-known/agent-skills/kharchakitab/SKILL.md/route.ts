export const dynamic = "force-static";

export function GET() {
  const content = `---
name: kharchakitab
description: Log and track expenses using Hinglish voice commands.
---

# KharchaKitab

KharchaKitab is a voice-first expense tracker designed for Indian users. It understands Hinglish (a mix of Hindi and English) to make expense logging natural and fast.

## Capabilities

- **Voice Logging**: Speak naturally to log expenses.
- **Hinglish Support**: "Samosa ₹20 khaya" or "Petrol worth 500".
- **Categorization**: Automatically categorizes your spending.
- **Budget Tracking**: Stay on top of your daily and monthly limits.

## How to use

1. Speak or type your expense.
2. The agent parses the amount, category, and note.
3. Your dashboard updates in real-time.
`;

  return new Response(content, {
    headers: {
      "Content-Type": "text/markdown",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
