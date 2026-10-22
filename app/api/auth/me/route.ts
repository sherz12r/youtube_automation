import { authenticateRequest } from "../../../../lib/auth";

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, { allowInactive: true });
  if ("response" in auth) return auth.response;
  return Response.json({ user: auth.user }, { headers: { "Cache-Control": "no-store" } });
}
