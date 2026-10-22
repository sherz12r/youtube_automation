import { startSession, validSameOriginMutation } from "../../../../lib/auth";
import { subscriptionActive, verifyCredentials } from "../../../../db/platform-store";

const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate" };

export async function POST(request: Request) {
  if (!validSameOriginMutation(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403, headers: noStore });
  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Enter your email and password." }, { status: 400, headers: noStore }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password || password.length > 200) return Response.json({ error: "Enter your email and password." }, { status: 400, headers: noStore });
  try {
    const user = await verifyCredentials(email, password);
    if (!user) return Response.json({ error: "Email or password is incorrect." }, { status: 401, headers: noStore });
    if (!subscriptionActive(user)) return Response.json({ error: "Your subscription is inactive. Contact the administrator to renew access." }, { status: 402, headers: noStore });
    return Response.json({ user }, { headers: { ...noStore, "Set-Cookie": await startSession(request, user.id) } });
  } catch (error) {
    console.error("Login failed:", error);
    return Response.json({ error: "Sign-in is not available. Confirm ADMIN_EMAIL and ADMIN_PASSWORD are configured, then restart the app." }, { status: 503, headers: noStore });
  }
}
