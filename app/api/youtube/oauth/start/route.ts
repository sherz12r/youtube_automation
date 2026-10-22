import { authenticateRequest } from "../../../../../lib/auth";
import { oauthCookie, youtubeAuthorizationUrl, youtubeOAuthRedirectUri } from "../../../../../lib/youtube-oauth";

export const dynamic = "force-dynamic";

function settingsError(request: Request, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("youtube", "error");
  url.searchParams.set("message", message);
  return Response.redirect(url, 303);
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  if (!clientId) return settingsError(request, "The administrator must configure YOUTUBE_CLIENT_ID first.");
  try {
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
    const redirectUri = youtubeOAuthRedirectUri(request);
    return new Response(null, {
      status: 302,
      headers: {
        "Cache-Control": "no-store",
        Location: youtubeAuthorizationUrl(clientId, redirectUri, state),
        "Set-Cookie": oauthCookie(request, state),
      },
    });
  } catch (error) {
    return settingsError(request, error instanceof Error ? error.message : "YouTube authorization could not start.");
  }
}
