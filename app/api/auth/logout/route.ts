import { endSession, validSameOriginMutation } from "../../../../lib/auth";

export async function POST(request: Request) {
  if (!validSameOriginMutation(request)) return Response.json({ error: "Cross-site requests are not allowed." }, { status: 403 });
  return Response.json({ signedOut: true }, { headers: { "Cache-Control": "no-store", "Set-Cookie": await endSession(request) } });
}
