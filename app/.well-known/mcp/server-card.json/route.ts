import { SITE_URL, SITE_DESCRIPTION } from "@/src/config/site";

export const dynamic = "force-static";

export function GET() {
  const card = {
    serverInfo: {
      name: "KharchaKitab",
      version: "0.1.0",
    },
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/api/mcp`,
    transport: {
      type: "streamable-http",
    },
    capabilities: {
      tools: true,
      resources: false,
      prompts: false,
    },
  };

  return Response.json(card, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
