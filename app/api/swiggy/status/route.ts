import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * Reports whether a Swiggy token is held. The token cookie is httpOnly, so the
 * client cannot check for itself — without this it has to trust a localStorage
 * flag that outlives the 5-day token.
 *
 * Presence only: a token revoked server-side before its expiry still reads as
 * connected here. That case surfaces as a 401 on the next tool call.
 */
export async function GET() {
  const cookieStore = await cookies();
  const connected = Boolean(cookieStore.get("swiggy_access_token")?.value);

  return NextResponse.json(
    { connected },
    { headers: { "Cache-Control": "no-store" } }
  );
}
