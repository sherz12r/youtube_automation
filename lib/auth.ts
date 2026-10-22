import { createSession, deleteSession, subscriptionActive, userForSession, type SafeUser } from "../db/platform-store";

const COOKIE = "noor_session";
const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

async function tokenHash(token: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function cookieValue(request: Request) {
  const header = request.headers.get("cookie") || "";
  for (const item of header.split(";")) {
    const [name, ...rest] = item.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function validSameOriginMutation(request: Request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  const forwardedProto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  return origin === `${forwardedProto}://${forwardedHost}`;
}

export async function startSession(request: Request, userId: string) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const token = toHex(random);
  const expiresAt = Date.now() + SESSION_LIFETIME;
  await createSession(userId, await tokenHash(token), expiresAt);
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_LIFETIME / 1000)}${secure ? "; Secure" : ""}`;
}

export async function endSession(request: Request) {
  const token = cookieValue(request);
  if (token) await deleteSession(await tokenHash(token));
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

export type AuthResult = { user: SafeUser } | { response: Response };

export async function authenticateRequest(request: Request, options: { admin?: boolean; allowInactive?: boolean } = {}): Promise<AuthResult> {
  const token = cookieValue(request);
  const user = token ? await userForSession(await tokenHash(token)) : null;
  if (!user) return { response: Response.json({ error: "Please sign in to continue." }, { status: 401, headers: { "Cache-Control": "no-store" } }) };
  if (options.admin && user.role !== "admin") return { response: Response.json({ error: "Administrator access is required." }, { status: 403, headers: { "Cache-Control": "no-store" } }) };
  if (!options.allowInactive && !subscriptionActive(user)) return { response: Response.json({ error: "Your subscription is inactive. Contact the administrator to renew access.", code: "SUBSCRIPTION_REQUIRED" }, { status: 402, headers: { "Cache-Control": "no-store" } }) };
  return { user };
}

export async function requireMutationUser(request: Request, options: { admin?: boolean; allowInactive?: boolean } = {}) {
  if (!validSameOriginMutation(request)) return { response: Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 }) } as AuthResult;
  return authenticateRequest(request, options);
}
