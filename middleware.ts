import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const acceptHeader = request.headers.get("accept") || "";
  const isMarkdownRequest = acceptHeader.includes("text/markdown");
  const isInternal = request.headers.get("x-internal-request") === "true";

  // If it's a markdown request and not already an internal fetch
  if (isMarkdownRequest && !isInternal) {
    const url = new URL(request.url);
    
    // Skip static assets and API routes
    const isPage = !url.pathname.startsWith("/_next") && 
                   !url.pathname.startsWith("/api") && 
                   !/\.[a-zA-Z0-9]{2,5}$/.test(url.pathname);

    if (isPage) {
      const rewriteUrl = new URL("/api/to-markdown", request.url);
      rewriteUrl.searchParams.set("url", request.url);
      return NextResponse.rewrite(rewriteUrl);
    }
  }

  const response = NextResponse.next();

  // Link headers for agent discovery per RFC 8288 / RFC 9727
  response.headers.set(
    "Link",
    [
      `</.well-known/api-catalog>; rel="api-catalog"`,
      `</openapi.json>; rel="service-desc"`,
      `</about>; rel="service-doc"`,
      `</.well-known/mcp/server-card.json>; rel="mcp-server-card"`,
      `</.well-known/agent-skills/index.json>; rel="agent-skills"`,
    ].join(", "),
  );

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
