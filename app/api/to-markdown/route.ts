import { NextRequest, NextResponse } from "next/server";
import TurndownService from "turndown";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new NextResponse("Missing url parameter", { status: 400 });
  }

  try {
    // Fetch the target URL as HTML
    // We use a custom header to avoid loops if the middleware catches this fetch
    const response = await fetch(targetUrl, {
      headers: {
        "Accept": "text/html",
        "X-Internal-Request": "true",
      },
    });

    if (!response.ok) {
      return new NextResponse(`Failed to fetch: ${response.statusText}`, { status: response.status });
    }

    const html = await response.text();

    // Extract basic metadata for YAML frontmatter
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1] : "";
    const descriptionMatch = html.match(/<meta\s+name="description"\s+content="(.*?)"/i) || 
                             html.match(/<meta\s+property="og:description"\s+content="(.*?)"/i);
    const description = descriptionMatch ? descriptionMatch[1] : "";

    // Basic cleaning of HTML before conversion
    // Remove scripts, styles, nav, footer, etc.
    const cleanedHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ""); // Also remove header usually

    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
    });

    let markdown = turndownService.turndown(cleanedHtml);

    // Prepended YAML frontmatter if metadata exists
    if (title || description) {
      const frontmatter = [
        "---",
        title ? `title: ${title}` : "",
        description ? `description: ${description}` : "",
        "---",
        "",
        ""
      ].filter(Boolean).join("\n");
      markdown = frontmatter + markdown;
    }

    // Estimate tokens (roughly 4 chars per token)
    const tokenCount = Math.ceil(markdown.length / 4);

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Vary": "Accept",
        "x-markdown-tokens": tokenCount.toString(),
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    console.error("Markdown conversion error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
