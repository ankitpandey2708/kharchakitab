import { NextRequest, NextResponse } from "next/server";
import { SWIGGY_CLIENT_ID, SWIGGY_REDIRECT_URI, SWIGGY_TOKEN_URL } from "@/src/lib/swiggy/oauth";

const POPUP_HTML = (origin: string) => `<!DOCTYPE html>
<html>
  <head><title>Connecting Swiggy…</title></head>
  <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff8f0">
    <p style="color:#555">Connecting… this window will close shortly.</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'SWIGGY_CONNECTED' }, '${origin}');
          setTimeout(() => window.close(), 200);
        } else {
          window.location.href = '/';
        }
      } catch(e) {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`;

const ERROR_HTML = (origin: string, msg: string) => `<!DOCTYPE html>
<html>
  <head><title>Swiggy Error</title></head>
  <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fff8f0">
    <p style="color:#c0392b">Error: ${msg}</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'SWIGGY_ERROR', error: '${msg}' }, '${origin}');
          setTimeout(() => window.close(), 1500);
        } else {
          window.location.href = '/';
        }
      } catch(e) {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = new URL(request.url).origin;
  const htmlHeaders = { "Content-Type": "text/html" };

  // Mock mode — skip real OAuth
  if (searchParams.get("mock") === "true") {
    const res = new NextResponse(POPUP_HTML(origin), { headers: htmlHeaders });
    res.cookies.set("swiggy_access_token", "mock_token", {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 5, // 5 days
      path: "/",
    });
    return res;
  }

  const code = searchParams.get("code");
  const returnedState = searchParams.get("state");

  if (!code) {
    return new NextResponse(ERROR_HTML(origin, "No authorization code"), { headers: htmlHeaders });
  }

  const storedState = request.cookies.get("swiggy_oauth_state")?.value;
  if (storedState && returnedState !== storedState) {
    return new NextResponse(ERROR_HTML(origin, "State mismatch"), { headers: htmlHeaders });
  }

  const codeVerifier = request.cookies.get("swiggy_pkce_verifier")?.value;
  if (!codeVerifier) {
    return new NextResponse(ERROR_HTML(origin, "Missing PKCE verifier"), { headers: htmlHeaders });
  }

  try {
    const tokenRes = await fetch(SWIGGY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: SWIGGY_REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: SWIGGY_CLIENT_ID,
      }),
    });

    if (!tokenRes.ok) {
      return new NextResponse(ERROR_HTML(origin, `Token exchange failed: ${tokenRes.status}`), { headers: htmlHeaders });
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    const { access_token } = tokenData;

    const res = new NextResponse(POPUP_HTML(origin), { headers: htmlHeaders });
    res.cookies.set("swiggy_access_token", access_token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 5,
      path: "/",
    });
    res.cookies.delete("swiggy_pkce_verifier");
    res.cookies.delete("swiggy_oauth_state");
    return res;
  } catch {
    return new NextResponse(ERROR_HTML(origin, "Token exchange failed"), { headers: htmlHeaders });
  }
}
