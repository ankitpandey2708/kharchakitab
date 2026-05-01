import crypto from "node:crypto";

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export const SWIGGY_CLIENT_ID = process.env.SWIGGY_CLIENT_ID ?? "";
export const SWIGGY_REDIRECT_URI =
  process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/swiggy/callback`
    : "http://localhost:3000/api/swiggy/callback";

export const SWIGGY_AUTH_URL = "https://mcp.swiggy.com/auth/authorize";
export const SWIGGY_TOKEN_URL = "https://mcp.swiggy.com/auth/token";
export const SWIGGY_LOGOUT_URL = "https://mcp.swiggy.com/auth/logout";
export const SWIGGY_MCP_FOOD_URL = "https://mcp.swiggy.com/food";
