import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { authUrl, oauthConfigured, redirectUriFor } from "@/lib/integrations/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!oauthConfigured()) {
    return NextResponse.redirect(new URL("/settings?google=not_configured", req.url));
  }
  // Если платформа открыта по другому адресу (127.0.0.1 вместо localhost), переводим вход на адрес из redirect URI,
  // иначе cookie с проверочным state не дойдёт до callback.
  const target = new URL(redirectUriFor(req));
  if (target.origin !== new URL(req.url).origin) {
    return NextResponse.redirect(new URL("/api/auth/google/start", target.origin));
  }
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("g_oauth_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authUrl(redirectUriFor(req), state));
}
