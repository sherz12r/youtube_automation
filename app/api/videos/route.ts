import { Readable } from "node:stream";
import { listStories } from "../../../db/story-store";
import { createVideoReadStream, readVideo, updateVideoYoutubeUrl, writeVideoChunk } from "../../../db/video-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const noStore = { "Cache-Control": "no-store, no-cache, must-revalidate", "CDN-Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

function storyId(request: Request) {
  const value = Number(new URL(request.url).searchParams.get("storyId"));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sameSite(request: Request) {
  return request.headers.get("sec-fetch-site") !== "cross-site";
}

async function storyExists(id: number) {
  return (await listStories()).some(story => story.id === id);
}

export async function GET(request: Request) {
  const id = storyId(request);
  if (!id) return json({ error: "A valid story ID is required." }, 400);
  try {
    const stored = await readVideo(id);
    if (!stored) return json({ error: "No shared video exists for this story." }, 404);
    const stream = Readable.toWeb(createVideoReadStream(stored.path)) as ReadableStream;
    return new Response(stream, { headers: {
      ...noStore,
      "Content-Type": stored.metadata.mimeType,
      "Content-Length": String(stored.metadata.size),
      "Content-Disposition": `inline; filename="story-${id}-${stored.metadata.language}.webm"`,
      "X-Video-Language": stored.metadata.language,
      "X-Renderer-Version": String(stored.metadata.rendererVersion),
      ...(stored.metadata.youtubeUrl ? { "X-YouTube-Url": stored.metadata.youtubeUrl } : {}),
    } });
  } catch (error) {
    console.error("Shared video read failed:", error);
    return json({ error: "The shared video could not be loaded from the server." }, 503);
  }
}

export async function PUT(request: Request) {
  const id = storyId(request);
  if (!id || !sameSite(request)) return json({ error: "A valid same-site video upload is required." }, 400);
  const language = request.headers.get("x-video-language");
  const rendererVersion = Number(request.headers.get("x-renderer-version"));
  if ((language !== "ur" && language !== "en") || !Number.isSafeInteger(rendererVersion) || rendererVersion < 1) {
    return json({ error: "Valid video language and renderer version headers are required." }, 400);
  }
  try {
    if (!await storyExists(id)) return json({ error: "Story not found." }, 404);
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > 2 * 1024 * 1024) return json({ error: "Video chunks must be 2 MB or smaller." }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    const result = await writeVideoChunk({ storyId: id, language, rendererVersion, contentRange: request.headers.get("content-range"), bytes });
    return json(result, result.complete ? 201 : 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The shared video could not be saved.";
    const invalid = /required|invalid|too large|2 MB|length|out of order|expired/i.test(message);
    return json({ error: message }, invalid ? 400 : 503);
  }
}

export async function POST(request: Request) {
  const id = storyId(request);
  if (!id || !sameSite(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "A valid same-site metadata request is required." }, 400);
  }
  try {
    const body = await request.json() as { youtubeUrl?: unknown };
    if (typeof body.youtubeUrl !== "string" || !body.youtubeUrl.trim()) return json({ error: "A YouTube URL is required." }, 400);
    return await updateVideoYoutubeUrl(id, body.youtubeUrl.trim())
      ? json({ saved: true })
      : json({ error: "No shared video exists for this story." }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Video metadata could not be updated." }, 400);
  }
}
