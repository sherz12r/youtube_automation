export const youtubeOAuthCookie = "noor_youtube_oauth";
export const youtubeUploadScope = "https://www.googleapis.com/auth/youtube.upload";

export function youtubeOAuthRedirectUri(request: Request) {
  const configured = process.env.YOUTUBE_OAUTH_REDIRECT_URI?.trim();
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("YOUTUBE_OAUTH_REDIRECT_URI must use HTTPS.");
    }
    return url.toString();
  }
  const source = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || source.host;
  const protocol = request.headers.get("x-forwarded-proto") || source.protocol.replace(":", "");
  return `${protocol}://${host}/api/youtube/oauth/callback`;
}

export function youtubeAuthorizationUrl(clientId: string, redirectUri: string, state: string) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: youtubeUploadScope,
    state,
  }).toString();
  return url.toString();
}

export function oauthCookieValue(request: Request) {
  for (const item of (request.headers.get("cookie") || "").split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === youtubeOAuthCookie) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function oauthStateMatches(expected: string, received: string) {
  if (!expected || expected.length !== received.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ received.charCodeAt(index);
  return difference === 0;
}

export function oauthCookie(request: Request, state: string, maximumAge = 600) {
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${youtubeOAuthCookie}=${encodeURIComponent(state)}; Path=/api/youtube/oauth; HttpOnly; SameSite=Lax; Max-Age=${maximumAge}${secure ? "; Secure" : ""}`;
}
