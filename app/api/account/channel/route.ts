import { getChannelProfile, updateChannelProfile } from "../../../../db/platform-store";
import { authenticateRequest, requireMutationUser } from "../../../../lib/auth";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const auth = await authenticateRequest(request);
  if ("response" in auth) return auth.response;
  return json({ profile: await getChannelProfile(auth.user.id) });
}

export async function PUT(request: Request) {
  const auth = await requireMutationUser(request);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid channel settings." }, 400);
    return json({ profile: await updateChannelProfile(auth.user.id, body) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Channel settings could not be saved." }, 400);
  }
}
