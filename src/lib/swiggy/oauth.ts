import crypto from "node:crypto";

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

// Internal — consumers go through getSwiggyClientId(), which falls back to DCR.
const SWIGGY_CLIENT_ID = process.env.SWIGGY_CLIENT_ID ?? "";

/**
 * Public origin this request came in on. NEXT_PUBLIC_APP_URL wins when set;
 * otherwise derive from the proxy headers so prod (kharchakitab.com), preview
 * deploys and localhost each get their own origin without extra config.
 */
export function getAppOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0] ??
      (/^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}

export function getSwiggyRedirectUri(request: Request): string {
  return `${getAppOrigin(request)}/api/swiggy/callback`;
}

/**
 * Swiggy issues no static client identity — clients self-register via Dynamic
 * Client Registration (RFC 7591) and use the returned client_id at /authorize.
 * https://mcp.swiggy.com/builders/docs/start/authenticate/
 *
 * The client_id is bound to the redirect URI it was registered with, so the
 * cache is keyed by redirect URI. This is per-instance and simply re-registers
 * on a cold start, which the endpoint is designed for.
 */
const clientIdCache = new Map<string, Promise<string>>();

export function getSwiggyClientId(redirectUri: string): Promise<string> {
  // Escape hatch: a manually registered client_id wins if one is configured.
  if (SWIGGY_CLIENT_ID) return Promise.resolve(SWIGGY_CLIENT_ID);

  const cached = clientIdCache.get(redirectUri);
  if (cached) return cached;

  // Cache the promise, not the result, so concurrent requests share one
  // registration. Failures are evicted so the next request retries.
  const pending = registerSwiggyClient(redirectUri).catch((e: unknown) => {
    clientIdCache.delete(redirectUri);
    throw e;
  });
  clientIdCache.set(redirectUri, pending);
  return pending;
}

async function registerSwiggyClient(redirectUri: string): Promise<string> {
  const res = await fetch(SWIGGY_REGISTER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "KharchaKitab",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // public client — PKCE, no secret
      scope: "mcp:tools",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Swiggy client registration failed: ${res.status} (redirect_uri ${redirectUri} may not be allowlisted)`
    );
  }

  const data = (await res.json()) as { client_id?: string };
  if (!data.client_id) throw new Error("Swiggy client registration returned no client_id");
  return data.client_id;
}

const SWIGGY_REGISTER_URL = "https://mcp.swiggy.com/auth/register";
export const SWIGGY_AUTH_URL = "https://mcp.swiggy.com/auth/authorize";
export const SWIGGY_TOKEN_URL = "https://mcp.swiggy.com/auth/token";
export const SWIGGY_LOGOUT_URL = "https://mcp.swiggy.com/auth/logout";
export const SWIGGY_MCP_FOOD_URL = "https://mcp.swiggy.com/food";
export const SWIGGY_MCP_INSTAMART_URL = "https://mcp.swiggy.com/im";
