import { isStoredStory, legacyStories, type Story } from "./stories";
import { initialStories } from "./story-defaults";

export type StoryResponse = { stories: Story[]; storyId?: number };

export async function storyRequest(init: RequestInit = {}): Promise<StoryResponse> {
  const response = await fetch("/api/stories", {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(15000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Stories could not be saved or loaded. Please retry.");
  if (!Array.isArray(payload.stories) || !payload.stories.every(isStoredStory) || !payload.stories.length) {
    throw new Error("The server returned an invalid story queue. Please retry.");
  }
  return payload;
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
