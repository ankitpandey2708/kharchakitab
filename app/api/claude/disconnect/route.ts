import { NextResponse } from "next/server";
import {
  COOKIE_CLAUDE_ACCESS_TOKEN,
  COOKIE_CLAUDE_REFRESH_TOKEN,
  COOKIE_CLAUDE_ORG_UUID,
  COOKIE_CLAUDE_ACCOUNT_EMAIL,
  COOKIE_CLAUDE_SCOPES,
  COOKIE_CLAUDE_TOKEN_EXPIRES_AT,
} from "@/src/lib/claude/oauth";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  res.cookies.delete(COOKIE_CLAUDE_ACCESS_TOKEN);
  res.cookies.delete(COOKIE_CLAUDE_REFRESH_TOKEN);
  res.cookies.delete(COOKIE_CLAUDE_ORG_UUID);
  res.cookies.delete(COOKIE_CLAUDE_ACCOUNT_EMAIL);
  res.cookies.delete(COOKIE_CLAUDE_SCOPES);
  res.cookies.delete(COOKIE_CLAUDE_TOKEN_EXPIRES_AT);

  return res;
}
