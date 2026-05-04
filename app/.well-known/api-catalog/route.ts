import { SITE_URL } from "@/src/config/site";

export const dynamic = "force-static";

export function GET() {
  const catalog = {
    linkset: [
      {
        anchor: `${SITE_URL}/api`,
        "service-desc": [
          {
            href: `${SITE_URL}/openapi.json`,
            type: "application/openapi+json",
            title: "KharchaKitab API OpenAPI Specification",
          },
          {
            href: `${SITE_URL}/.well-known/mcp/server-card.json`,
            type: "application/json",
            title: "KharchaKitab MCP Server Card",
          },
        ],
        "service-doc": [
          {
            href: `${SITE_URL}/about`,
            type: "text/html",
            title: "KharchaKitab Documentation",
          },
        ],
        status: [
          {
            href: `${SITE_URL}/api/health`,
            type: "application/json",
            title: "KharchaKitab API Health Status",
          },
        ],
      },
    ],
  };

  return Response.json(catalog, {
    headers: {
      "Content-Type": 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
