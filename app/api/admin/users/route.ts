import { createUser, listUsers, updateUser, type SubscriptionStatus } from "../../../../db/platform-store";
import { authenticateRequest, requireMutationUser } from "../../../../lib/auth";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const auth = await authenticateRequest(request, { admin: true });
  if ("response" in auth) return auth.response;
  return json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const auth = await requireMutationUser(request, { admin: true });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { email?: unknown; name?: unknown; password?: unknown; subscriptionEndsAt?: unknown };
    const subscriptionEndsAt = body.subscriptionEndsAt === null || body.subscriptionEndsAt === "" ? null : Number(body.subscriptionEndsAt);
    const user = await createUser({ email: String(body.email || ""), name: String(body.name || ""), password: String(body.password || ""), subscriptionEndsAt });
    return json({ user, users: await listUsers() }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "User could not be created." }, 400);
  }
}

export async function PATCH(request: Request) {
  const auth = await requireMutationUser(request, { admin: true });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json() as { id?: unknown; name?: unknown; password?: unknown; subscriptionStatus?: unknown; subscriptionEndsAt?: unknown };
    const status = typeof body.subscriptionStatus === "string" ? body.subscriptionStatus as SubscriptionStatus : undefined;
    const subscriptionEndsAt = body.subscriptionEndsAt === undefined ? undefined : body.subscriptionEndsAt === null || body.subscriptionEndsAt === "" ? null : Number(body.subscriptionEndsAt);
    const user = await updateUser({ id: String(body.id || ""), name: typeof body.name === "string" ? body.name : undefined, password: typeof body.password === "string" ? body.password : undefined, subscriptionStatus: status, subscriptionEndsAt });
    return json({ user, users: await listUsers() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "User could not be updated." }, 400);
  }
}
