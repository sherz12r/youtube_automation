import { updateChannelProfile } from "../../../../../db/platform-store";
import { authenticateRequest } from "../../../../../lib/auth";
import { oauthCookie, oauthCookieValue, oauthStateMatches, youtubeOAuthRedirectUri } from "../../../../../lib/youtube-oauth";

export const dynamic = "force-dynamic";

type TokenResponse = { refresh_token?: string; error?: string; error_description?: string };

function finish(request: Request, status: "connected" | "error", message?: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("youtube", status);
  if (message) url.searchParams.set("message", message);
  return new Response(null, {
    status: 303,
    headers: { "Cache-Control": "no-store", Location: url.toString(), "Set-Cookie": oauthCookie(request, "", 0) },
  });
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const state = url.searchParams.get("state") || "";
  if (!oauthStateMatches(oauthCookieValue(request), state)) return finish(request, "error", "The YouTube connection request expired. Please try again.");
  if (url.searchParams.get("error")) return finish(request, "error", "Google authorization was cancelled or denied.");
  const code = url.searchParams.get("code") || "";
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim() || "";
  if (!code || !clientId || !clientSecret) return finish(request, "error", "YouTube OAuth configuration is incomplete.");
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: youtubeOAuthRedirectUri(request), grant_type: "authorization_code" }),
    });
    const result = await response.json() as TokenResponse;
    if (!response.ok || !result.refresh_token) {
      const detail = result.error === "redirect_uri_mismatch"
        ? "Google rejected the callback URL. Add this app's /api/youtube/oauth/callback URL to the OAuth client's authorized redirect URIs."
        : result.error_description || "Google did not issue a refresh token. Try connecting again and approve access.";
      return finish(request, "error", detail);
    }
    await updateChannelProfile(auth.user.id, { youtubeRefreshToken: result.refresh_token });
    return finish(request, "connected");
  } catch (error) {
    console.error("YouTube OAuth callback failed:", error instanceof Error ? error.message : error);
    return finish(request, "error", error instanceof Error ? error.message : "YouTube authorization could not be saved.");
  }
}
