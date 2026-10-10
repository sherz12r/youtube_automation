import { isStoredStory, legacyStories, type Story } from "./stories";
import { initialStories } from "./story-defaults";

export type StoryResponse = { stories: Story[]; storyId?: number };

async function jsonResponse(response: Response, fallback: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); }
  catch {
    const contentType = response.headers.get("content-type") ?? "";
    const returnedHtml = contentType.includes("text/html") || /^\s*</.test(text);
    throw new Error(returnedHtml
      ? `The server returned an HTML error page (HTTP ${response.status}) instead of API data. Restart the deployed app and check the cPanel/Passenger log.`
      : fallback);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(fallback);
  return payload as Record<string, unknown>;
}

export async function storyRequest(init: RequestInit = {}): Promise<StoryResponse> {
  const response = await fetch("/api/stories", {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const payload = await jsonResponse(response, "The story service returned an invalid response. Please retry.");
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Stories could not be saved or loaded. Please retry.");
  if (!Array.isArray(payload.stories) || !payload.stories.every(isStoredStory) || !payload.stories.length) {
    throw new Error("The server returned an invalid story queue. Please retry.");
  }
  return payload as StoryResponse;
}

export async function generateStoryRequest(): Promise<StoryResponse> {
  const response = await fetch("/api/stories/generate", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(180000),
  });
  const payload = await jsonResponse(response, "The story generator returned an invalid response. Please retry.");
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "A complete new story could not be generated. Please retry.");
  if (!Array.isArray(payload.stories) || !payload.stories.every(isStoredStory) || !payload.stories.length || !payload.storyId) {
    throw new Error("The story generator returned an invalid result. Please retry.");
  }
  return payload as StoryResponse;
}

export async function importBrowserStories() {
  let raw: string | null = null;
  try {
    if (localStorage.getItem("noor-stories-migrated-v1") === "true") return;
    raw = localStorage.getItem("noor-stories");
  } catch { return; } // Browsers may block localStorage; the server still works.
  const stories = legacyStories(raw, initialStories);
  for (let index = 0; index < stories.length; index += 3) {
    await storyRequest({ method: "POST", body: JSON.stringify({ action: "import", stories: stories.slice(index, index + 3) }) });
  }
  if (stories.length) {
    try { localStorage.setItem("noor-stories-migrated-v1", "true"); }
    catch { /* Imports are idempotent if the browser cannot save the marker. */ }
  }
  // Keep the original noor-stories value as a recovery backup.
}
