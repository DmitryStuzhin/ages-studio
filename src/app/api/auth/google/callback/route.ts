import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { accessToken, exchangeCode, myChannel, redirectUriFor } from "@/lib/integrations/youtube";
import { setGoogleAuth, runSync, getGoogleAuth } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?google=${q}`, req.url));
  const jar = await cookies();
  const expected = jar.get("g_oauth_state")?.value;
  jar.delete("g_oauth_state");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) return back("bad_state");
  try {
    const tok = await exchangeCode(code, redirectUriFor(req));
    const prev = await getGoogleAuth();
    const refreshToken = tok.refresh_token ?? prev?.refreshToken;
    if (!refreshToken) return back("no_refresh");
    const ch = await myChannel(tok.access_token ?? (await accessToken(refreshToken)));
    await setGoogleAuth({ refreshToken, channelId: ch?.id ?? null, channelTitle: ch?.title ?? null, connectedAt: new Date().toISOString() });
    void runSync("manual");
    return back("connected");
  } catch (e) {
    console.error("[google oauth]", e);
    return back("error");
  }
}
