import { SITE_URL } from "../../../../src/config/site";

export const dynamic = "force-static";

export function GET() {
  const index = {
    $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
    skills: [
      {
        name: "kharchakitab",
        type: "skill-md",
        description: "Log and track expenses using Hinglish voice commands.",
        url: `${SITE_URL}/.well-known/agent-skills/kharchakitab/SKILL.md`,
      },
      {
        name: "webmcp",
        type: "webmcp",
        description: "Exposes browser-based tools for expense tracking and financial analysis to AI agents.",
        url: SITE_URL,
      },
    ],
  };

  return Response.json(index, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
