import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SWIGGY_LOGOUT_URL } from "@/src/lib/swiggy/oauth";
import { isMockMode } from "@/src/lib/swiggy/client";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("swiggy_access_token")?.value;

  if (token && !isMockMode()) {
    try {
      await fetch(SWIGGY_LOGOUT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // best-effort — clear cookie regardless
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete("swiggy_access_token");
  return res;
}
