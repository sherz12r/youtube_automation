import { createStory, importStories, listStories, updateStoryStatus } from "../../../db/story-store";
import { isStoredStory, validStatuses, type Story } from "../../../lib/stories";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const headers = { "Cache-Control": "no-store, no-cache, must-revalidate", "CDN-Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

function failure(error: unknown) {
  console.error("Story database request failed:", error);
  return json({ error: "Stories could not be saved or loaded. Please retry. If this continues, check the server's story database configuration." }, 503);
}

export async function GET() {
  try { return json({ stories: await listStories() }); }
  catch (error) { return failure(error); }
}

async function body(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error("Cross-site request");
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("JSON required");
  // Bound the streamed request too; Content-Length can be missing or forged.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Body required");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1024 * 1024) { await reader.cancel(); throw new Error("Body too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Object required");
  return parsed as Record<string, unknown>;
}

export async function POST(request: Request) {
  let payload;
  try { payload = await body(request); }
  catch { return json({ error: "A valid same-site JSON story request is required (maximum 1 MB)." }, 400); }
  if (payload.action === "import") {
    if (!Array.isArray(payload.stories) || payload.stories.length > 100 || !payload.stories.every(isStoredStory)) {
      return json({ error: "Invalid stories to import (maximum 100 per request)." }, 400);
    }
    try { return json({ stories: await importStories(payload.stories) }); }
    catch (error) { return failure(error); }
  }
  if (!isStoredStory(payload.story)) return json({ error: "Invalid story." }, 400);
  try { return json(await createStory(payload.story), 201); }
  catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  let payload;
  try { payload = await body(request); }
  catch { return json({ error: "A valid same-site JSON story request is required." }, 400); }
  const { id, status, progress } = payload;
  if (!Number.isSafeInteger(id) || Number(id) <= 0 || !validStatuses.includes(status as Story["status"])
    || typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 100) {
    return json({ error: "Invalid story status." }, 400);
  }
  try {
    const stories = await updateStoryStatus(id as number, status as Story["status"], progress);
    return stories.some(story => story.id === id) ? json({ stories }) : json({ error: "Story not found." }, 404);
  } catch (error) { return failure(error); }
}
