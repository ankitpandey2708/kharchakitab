import { NextRequest } from "next/server";

export const runtime = "nodejs";

const buildShareBridgeHtml = (dataUrl: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>KharchaKitab</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        font-family: "DM Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
        background: radial-gradient(circle at 15% 20%, #ffe3c6 0%, transparent 45%),
          radial-gradient(circle at 85% 30%, #f7d8e0 0%, transparent 50%),
          #faf8f5;
        color: #1a1a1a;
        display: grid;
        place-items: center;
        min-height: 100vh;
      }
      .card {
        max-width: 420px;
        width: 90%;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 24px;
        padding: 24px;
        box-shadow: 0 18px 45px rgba(24, 24, 24, 0.08);
        border: 1px solid rgba(0, 0, 0, 0.06);
        backdrop-filter: blur(10px);
      }
      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .logo {
        width: 42px;
        height: 42px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.9);
        border: 1px solid rgba(0, 0, 0, 0.08);
        display: grid;
        place-items: center;
        box-shadow: 0 12px 24px rgba(24, 24, 24, 0.08);
      }
      .logo img {
        width: 24px;
        height: 24px;
      }
      .brand {
        font-family: "Playfair Display", "DM Sans", serif;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .brand span {
        color: #d46034;
      }
      .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.18em;
        color: #7a7a7a;
        margin-top: 14px;
      }
      h1 {
        margin: 12px 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0;
        color: #666;
        line-height: 1.5;
        font-size: 14px;
      }
    </style>
  </head>
  <body>
    <script>
      try {
        sessionStorage.setItem("kk_share_image", ${JSON.stringify(dataUrl)});
      } catch (err) {}
      window.location.replace("/");
    </script>
  </body>
</html>`;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return new Response(buildShareBridgeHtml(""), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mimeType = file.type || "image/jpeg";
  const dataUrl = `data:${mimeType};base64,${base64}`;

  return new Response(buildShareBridgeHtml(dataUrl), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET() {
  // Some platforms appear to navigate to the share target with GET first.
  // Returning a redirect avoids a 405 Method Not Allowed in that case.
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Cache-Control": "no-store",
    },
  });
}
