import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

await mkdir(resolve("work"), { recursive: true });
const directory = await mkdtemp(resolve("work/story-client-test-"));
for (const name of ["stories", "story-defaults", "story-client", "speech-audio", "video-timeline", "youtube-oauth"]) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  await writeFile(resolve(directory, `${name}.mjs`), outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"'));
}
const { initialStories } = await import(pathToFileURL(resolve(directory, "story-defaults.mjs")));
const { legacyStories, storyAge, storyCreatedAt } = await import(pathToFileURL(resolve(directory, "stories.mjs")));
const { importBrowserStories, storyRequest } = await import(pathToFileURL(resolve(directory, "story-client.mjs")));
const { combinePcmBuffers, SPEECH_VOICE, speechInstructions, splitTextForSpeech } = await import(pathToFileURL(resolve(directory, "speech-audio.mjs")));
const { MAX_VIDEO_SCENES, groupStoryMoments, loopingMotionPhase, sceneMotionProfile, scenePositionAtRatio } = await import(pathToFileURL(resolve(directory, "video-timeline.mjs")));
const { oauthCookie, oauthCookieValue, oauthStateMatches, youtubeAuthorizationUrl, youtubeOAuthRedirectUri, youtubeUploadScope } = await import(pathToFileURL(resolve(directory, "youtube-oauth.mjs")));

test("browser synchronization handles migration, blocked storage and failed saves", async t => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
  });

  await t.test("accepts old full-story and status-only backups, ignoring corruption", () => {
    assert.equal(legacyStories(JSON.stringify(initialStories), initialStories).length, 3);
    const statuses = legacyStories('{"1":{"status":"Published","progress":100}}', initialStories);
    assert.equal(statuses[0].status, "Published");
    assert.equal(statuses[0].titleEn, initialStories[0].titleEn);
    assert.deepEqual(legacyStories("not json", initialStories), []);
    assert.deepEqual(legacyStories('[{"id":null}]', initialStories), []);
  });

  await t.test("formats creation time for new and legacy stories", () => {
    const now = Date.UTC(2026, 9, 10, 12);
    const createdAt = now - 5 * 24 * 60 * 60 * 1000;
    assert.equal(storyAge({ id: createdAt, createdAt }, "en", now), "5 days ago");
    assert.equal(storyCreatedAt({ id: createdAt }), createdAt);
    assert.equal(storyAge({ id: 1 }, "en", now), "Starter story");
  });

  await t.test("splits narration into proxy-safe requests and wraps PCM segments in WAV", () => {
    const chunks = splitTextForSpeech("First sentence. Second sentence has several words. Third sentence.", 24);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every(chunk => chunk.length <= 24));
    const combined = combinePcmBuffers([Uint8Array.from([1,2]).buffer, Uint8Array.from([3,4]).buffer]);
    assert.equal(new DataView(combined).getUint32(40, true), 4);
    assert.deepEqual([...new Uint8Array(combined, 44)], [1,2,3,4]);
    assert.equal(new DataView(combined).getUint32(24, true), 24000);
    assert.throws(() => combinePcmBuffers([Uint8Array.from([1]).buffer]), /invalid PCM audio/);
  });

  await t.test("uses male narration instructions and advances through every video scene", () => {
    assert.equal(SPEECH_VOICE, "onyx");
    assert.match(speechInstructions("ur"), /adult male voice/i);
    assert.match(speechInstructions("en"), /adult male voice/i);
    assert.equal(MAX_VIDEO_SCENES, 10);
    const longUnpunctuatedStory = Array.from({ length: 280 }, (_, index) => `word${index}`).join(" ");
    const moments = groupStoryMoments([longUnpunctuatedStory]);
    assert.equal(moments.length, 10);
    assert.equal(moments.flatMap(moment => moment.split(" ")).length, 280);
    const indices = Array.from({ length: MAX_VIDEO_SCENES }, (_, index) =>
      scenePositionAtRatio(MAX_VIDEO_SCENES, (index + 0.5) / MAX_VIDEO_SCENES).index,
    );
    assert.deepEqual(indices, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(scenePositionAtRatio(3, 1).index, 2);
    assert.throws(() => scenePositionAtRatio(0, 0), /at least one scene/);
  });

  await t.test("assigns continuous story-aware motion instead of static image shuffling", () => {
    assert.deepEqual(sceneMotionProfile("prayer", true), { action: "pray", environment: "light", actorCount: 1, speed: 0.75 });
    assert.equal(sceneMotionProfile("journey", true).action, "walk");
    assert.equal(sceneMotionProfile("escape", true).action, "run");
    assert.equal(sceneMotionProfile("sea", true).environment, "waves");
    assert.equal(sceneMotionProfile("service", false).action, "serve");
    assert.notEqual(loopingMotionPhase(0.1, 1), loopingMotionPhase(0.6, 1));
    assert.equal(loopingMotionPhase(2, 1), 0);
  });

  await t.test("records animated stages without fetching or shuffling generated photos", async () => {
    const source = await readFile(new URL("../app/studio-client.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /fetch\(["']\/api\/visuals/);
    assert.doesNotMatch(source, /drawPhoto|realisticImages|imageSources/);
    assert.match(source, /drawMotionStage\(current\.scene/);
    assert.match(source, /const videoRendererVersion=5/);
  });

  await t.test("keeps completed videos visible across renderer upgrades and restores browser-only copies", async () => {
    const source = await readFile(new URL("../app/studio-client.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(source, /saved\?\.rendererVersion===videoRendererVersion/);
    assert.match(source, /if\(saved\)\{setVideoBlob\(saved\.blob\)/);
    assert.match(source, /if\(cached\)await saveStoryVideo\(storyId,cached\)/);
  });

  await t.test("offers independent accessible copy actions for every metadata field", async () => {
    const source = await readFile(new URL("../app/studio-client.tsx", import.meta.url), "utf8");
    for (const [label, target] of [["Copy title", "title"], ["Copy description", "description"], ["Copy tags", "tags"]]) {
      assert.match(source, new RegExp(`aria-label=.*${label}`));
      assert.match(source, new RegExp(`copyText\\([^\\n]+,"${target}"\\)`));
    }
    assert.match(source, /function CopyGlyph/);
    assert.match(source, /className={`copy-all/);
    assert.doesNotMatch(source, />▣<\/button>/);
  });

  await t.test("builds a secure YouTube OAuth flow for the public application URL", () => {
    const previous = process.env.YOUTUBE_OAUTH_REDIRECT_URI;
    delete process.env.YOUTUBE_OAUTH_REDIRECT_URI;
    try {
      const request = new Request("http://internal:3000/api/youtube/oauth/start", { headers: { "x-forwarded-host": "studio.example.test", "x-forwarded-proto": "https" } });
      const redirectUri = youtubeOAuthRedirectUri(request);
      assert.equal(redirectUri, "https://studio.example.test/api/youtube/oauth/callback");
      const authorization = new URL(youtubeAuthorizationUrl("client-id", redirectUri, "secure-state"));
      assert.equal(authorization.origin, "https://accounts.google.com");
      assert.equal(authorization.searchParams.get("scope"), youtubeUploadScope);
      assert.equal(authorization.searchParams.get("access_type"), "offline");
      assert.equal(authorization.searchParams.get("prompt"), "consent");
      const cookie = oauthCookie(request, "secure-state");
      assert.match(cookie, /HttpOnly; SameSite=Lax/);
      assert.match(cookie, /; Secure$/);
      assert.equal(oauthCookieValue(new Request(request.url, { headers: { cookie } })), "secure-state");
      assert.equal(oauthStateMatches("secure-state", "secure-state"), true);
      assert.equal(oauthStateMatches("secure-state", "wrong-state"), false);
    } finally {
      if (previous === undefined) delete process.env.YOUTUBE_OAUTH_REDIRECT_URI;
      else process.env.YOUTUBE_OAUTH_REDIRECT_URI = previous;
    }
  });

  await t.test("imports once, retains the backup and disables fetch caching", async () => {
    const raw = JSON.stringify(initialStories);
    values.set("noor-stories", raw);
    let requests = 0;
    globalThis.fetch = async (url, init) => {
      requests++;
      assert.equal(url, "/api/stories");
      assert.equal(init.cache, "no-store");
      assert.equal(JSON.parse(init.body).action, "import");
      return Response.json({ stories: initialStories });
    };
    await importBrowserStories();
    await importBrowserStories();
    assert.equal(requests, 1);
    assert.equal(values.get("noor-stories"), raw);
    assert.equal(values.get("noor-stories-migrated-v1"), "true");
  });

  await t.test("failed imports remain retryable and never discard legacy stories", async () => {
    values.delete("noor-stories-migrated-v1");
    globalThis.fetch = async () => Response.json({ error: "Storage unavailable" }, { status: 503 });
    await assert.rejects(importBrowserStories(), /Storage unavailable/);
    assert.equal(values.has("noor-stories-migrated-v1"), false);
    assert.ok(values.has("noor-stories"));
  });

  await t.test("blocked localStorage does not prevent loading shared stories", async () => {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Storage blocked"); } });
    globalThis.fetch = async (_, init) => {
      assert.equal(init.cache, "no-store");
      return Response.json({ stories: initialStories });
    };
    await importBrowserStories();
    assert.deepEqual((await storyRequest()).stories, initialStories);
  });

  await t.test("failed saves and invalid responses cannot report success", async () => {
    globalThis.fetch = async () => Response.json({ error: "Save failed" }, { status: 503 });
    await assert.rejects(storyRequest({ method: "POST", body: "{}" }), /Save failed/);
    globalThis.fetch = async () => Response.json({ stories: [] });
    await assert.rejects(storyRequest(), /invalid story queue/);
    globalThis.fetch = async () => new Response("<!DOCTYPE html><title>Forbidden</title>", { status: 403, headers: { "Content-Type": "text/html" } });
    await assert.rejects(storyRequest({ method: "POST", body: "{}" }), /HTML error page \(HTTP 403\).*cPanel\/Passenger/);
  });
});
