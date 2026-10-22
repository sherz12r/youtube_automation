import { headers } from "next/headers";
import { authenticateRequest } from "../lib/auth";
import StudioClient from "./studio-client";

export default async function Home() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") || "http";
  const request = new Request(`${protocol}://${host}/`, { headers: requestHeaders });
  const auth = await authenticateRequest(request, { allowInactive: true });
  return <StudioClient initialUser={"user" in auth ? auth.user : null}/>;
}
