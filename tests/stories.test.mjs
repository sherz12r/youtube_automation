import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

async function startServer(databasePath, startupFile, execArgv = [], envOverrides = {}) {
  const adminEmail = envOverrides.ADMIN_EMAIL ?? "admin@qa.test";
  const adminPassword = envOverrides.ADMIN_PASSWORD ?? "correct-horse-battery-staple";
  const child = fork(new URL(startupFile ? "./helpers/passenger-loader.cjs" : "./helpers/story-server.mjs", import.meta.url), startupFile ? [resolve(startupFile)] : [], {
    silent: true,
    execArgv,
    env: { ...process.env, STORY_DATABASE_PATH: databasePath, VIDEO_STORAGE_PATH: join(dirname(databasePath), "videos"), OPENAI_API_KEY: "", ADMIN_EMAIL: adminEmail, ADMIN_PASSWORD: adminPassword, YOUTUBE_TOKEN_ENCRYPTION_KEY: "qa-encryption-key-that-is-long-and-stable", ...envOverrides },
  });
  let output = "";
  child.stdout.on("data", data => { output += data; });
  child.stderr.on("data", data => { output += data; });
  const ready = new Promise((resolveReady, reject) => {
    child.once("message", resolveReady);
    child.once("exit", code => reject(new Error(`Server exited (${code}): ${output}`)));
  });
  let timeout;
  const timer = new Promise((_, reject) => { timeout = setTimeout(() => { child.kill(); reject(new Error(`Server did not start: ${output}`)); }, 20000); });
  try {
    const { port } = await Promise.race([ready, timer]);
    const base = `http://127.0.0.1:${port}`;
    const loginResponse = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: adminEmail, password: adminPassword }) });
    let cookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0] || "";
    return {
      loginStatus: loginResponse.status,
      async request(path = "/api/stories", method = "GET", body, headers = {}) {
        return fetch(`${base}${path}`, {
          method,
          headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      },
      async requestRaw(path, method = "GET", body, headers = {}, options = {}) {
        return fetch(`${base}${path}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body === undefined ? {} : { body }), ...options });
      },
      async unauthenticated(path = "/api/stories", method = "GET", body) { return fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); },
      async login(email, password) { const response = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) }); if (response.ok) cookie = response.headers.get("set-cookie")?.split(";", 1)[0] || ""; return response; },
      getCookie() { return cookie; },
      setCookie(value) { cookie = value; },
      async close() { if (child.exitCode !== null) return; const exited = once(child, "exit"); child.kill(); await exited; },
    };
  } finally { clearTimeout(timeout); }
}

test("shared stories survive fresh-device reads, concurrent saves, imports and server restarts", async t => {
  await mkdir(resolve("work"), { recursive: true });
  const directory = await mkdtemp(resolve("work/story-test-"));
  const databasePath = join(directory, "stories.sqlite");
  let server = await startServer(databasePath, undefined, [], { YOUTUBE_CLIENT_ID: "qa-client-id", YOUTUBE_REFRESH_TOKEN: "1//qa-main-admin-refresh-token" });
  t.after(async () => { await server.close(); });
  let createdId;
  let initial;

  await t.test("production HTML renders the correct first screen for anonymous and authenticated visitors", async () => {
    const publicResponse = await server.unauthenticated("/");
    assert.equal(publicResponse.status, 200);
    const publicHtml = await publicResponse.text();
    assert.match(publicHtml, /Noor Studio/);
    assert.match(publicHtml, /YouTube automation/);
    assert.match(publicHtml, /repeatable video engine/);
    assert.doesNotMatch(publicHtml, /codex-preview|Your site is taking shape/);

    const authenticatedResponse = await server.request("/");
    assert.equal(authenticatedResponse.status, 200);
    const authenticatedHtml = await authenticatedResponse.text();
    assert.match(authenticatedHtml, /Your story studio/);
    assert.doesNotMatch(authenticatedHtml, /repeatable video engine/);
  });

  await t.test("private APIs reject anonymous requests", async () => {
    const response = await server.unauthenticated("/api/stories");
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /sign in/i);
  });

  await t.test("YouTube connect starts a state-protected offline OAuth flow", async () => {
    const response = await server.requestRaw("/api/youtube/oauth/start", "GET", undefined, {}, { redirect: "manual" });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location"));
    assert.equal(location.origin, "https://accounts.google.com");
    assert.equal(location.searchParams.get("client_id"), "qa-client-id");
    assert.equal(location.searchParams.get("access_type"), "offline");
    assert.equal(location.searchParams.get("prompt"), "consent");
    assert.match(location.searchParams.get("redirect_uri"), /\/api\/youtube\/oauth\/callback$/);
    assert.match(response.headers.get("set-cookie"), /noor_youtube_oauth=.*HttpOnly; SameSite=Lax/);
  });

  await t.test("customer workspaces are isolated across stories, videos and channel credentials", async () => {
    const adminCookie = server.getCookie();
    const adminProfile = (await (await server.request("/api/account/channel")).json()).profile;
    assert.equal(adminProfile.youtubeConnected, true);
    initial = (await (await server.request()).json()).stories;
    const future = Date.now() + 31 * 24 * 60 * 60 * 1000;
    const tooShort = await server.request("/api/admin/users", "POST", { name: "Too Short", email: "short@qa.test", password: "Ab1!xy", subscriptionEndsAt: future });
    assert.equal(tooShort.status, 400);
    assert.match((await tooShort.json()).error, /at least 7 characters/i);
    for (const [name, email, password] of [["Tenant A", "a@qa.test", "Pass7!x"], ["Tenant B", "b@qa.test", "tenant-b-password-123"]]) {
      const created = await server.request("/api/admin/users", "POST", { name, email, password, subscriptionEndsAt: future });
      assert.equal(created.status, 201);
    }

    assert.equal((await server.login("a@qa.test", "Pass7!x")).status, 200);
    const tenantA = (await (await server.request()).json()).stories;
    const saved = await server.request("/api/stories", "POST", { story: { ...tenantA[0], titleEn: "Tenant A private topic" } });
    const privateStoryId = (await saved.json()).storyId;
    const profileSaved = await server.request("/api/account/channel", "PUT", { channelName: "Channel A", channelTopic: "Private topic A", youtubeRefreshToken: "refresh-token-owned-only-by-tenant-a" });
    assert.equal(profileSaved.status, 200);
    assert.equal((await profileSaved.json()).profile.youtubeConnected, true);

    assert.equal((await server.login("b@qa.test", "tenant-b-password-123")).status, 200);
    const tenantB = (await (await server.request()).json()).stories;
    assert.equal(tenantB.some(story => story.titleEn === "Tenant A private topic"), false);
    assert.equal((await server.request("/api/stories", "POST", { action: "status", id: privateStoryId, status: "Published", progress: 100 })).status, 404);
    assert.equal((await server.requestRaw(`/api/videos?storyId=${privateStoryId}`)).status, 404);
    const profileB = (await (await server.request("/api/account/channel")).json()).profile;
    assert.equal(profileB.youtubeConnected, false);
    assert.notEqual(profileB.channelName, "Channel A");
    server.setCookie(adminCookie);
  });

  await t.test("GET seeds one shared queue and disables caching", async () => {
    const response = await server.request();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    initial = (await response.json()).stories;
    assert.equal(initial.length, 3);
  });

  await t.test("automatic generation reports missing server configuration safely", async () => {
    const invalid = await server.request("/api/stories/generate", "POST", { format: "vertical" });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /full or short/);
    const response = await server.request("/api/stories/generate", "POST", { format: "short" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /OPENAI_API_KEY/);
  });

  await t.test("creation is visible from an independent mobile request without browser storage", async () => {
    const story = { ...initial[0], id: 100, titleEn: "New shared story", status: "Published" };
    const saved = await server.request("/api/stories", "POST", { story });
    assert.equal(saved.status, 201);
    createdId = (await saved.json()).storyId;
    const phone = await server.request("/api/stories", "GET", undefined, { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" });
    const created = (await phone.json()).stories.find(story => story.id === createdId);
    assert.equal(created.titleEn, "New shared story");
    assert.equal(created.status, "Needs review");
    assert.equal(created.createdAt, created.id);
  });

  await t.test("concurrent creations retain both titles and deduplicate retries", async () => {
    const make = titleEn => server.request("/api/stories", "POST", { story: { ...initial[0], titleEn } });
    const responses = await Promise.all([make("Concurrent A"), make("Concurrent B"), make("Concurrent A")]);
    for (const response of responses) assert.equal(response.status, 201);
    const { stories } = await (await server.request()).json();
    assert.equal(stories.filter(story => story.titleEn === "Concurrent A").length, 1);
    assert.equal(stories.filter(story => story.titleEn === "Concurrent B").length, 1);
    assert.equal(new Set(stories.map(story => story.id)).size, stories.length);
  });

  await t.test("legacy imports preserve existing stories and cannot roll back saved statuses", async () => {
    const original = initial.find(story => story.id === 1);
    await server.request("/api/stories", "POST", { action: "import", stories: initial });
    const legacy = [
      { ...original, status: "Approved", progress: 100 },
      { ...original, id: 987654, titleEn: "Legacy desktop story" },
      { ...original, id: 987654, titleEn: "Legacy phone story" },
    ];
    const imported = await server.request("/api/stories", "POST", { action: "import", stories: legacy });
    assert.equal(imported.status, 200);
    assert.equal((await imported.json()).stories.find(story => story.id === 1).status, "Approved");
    assert.equal((await server.request("/api/stories", "PATCH", { id: 1, status: "Published", progress: 100 })).status, 200);
    await server.request("/api/stories", "POST", { action: "import", stories: legacy });
    const { stories } = await (await server.request()).json();
    assert.equal(stories.find(story => story.id === 1).status, "Published");
    assert.ok(stories.some(story => story.id === createdId));
    assert.equal(stories.filter(story => story.titleEn.startsWith("Legacy ")).length, 2);
  });

  await t.test("invalid, oversized and cross-site writes do not change the queue", async () => {
    const before = await (await server.request()).json();
    for (const body of [null, [], { story: {} }, { action: "import", stories: [initial[0], {}] }, { story: { ...initial[0], progress: -1 } }, { padding: "x".repeat(1024 * 1024) }]) {
      assert.equal((await server.request("/api/stories", "POST", body)).status, 400);
    }
    assert.equal((await server.request("/api/stories", "POST", { story: initial[0] }, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await server.request("/api/stories", "PATCH", { id: -1, status: "Approved", progress: 100 })).status, 400);
    assert.equal((await server.request("/api/stories", "PATCH", { id: 42, status: "Approved", progress: 100 })).status, 404);
    assert.deepEqual(await (await server.request()).json(), before);
  });

  await t.test("status updates use cPanel-compatible POST actions", async () => {
    const response = await server.request("/api/stories", "POST", { action: "status", id: createdId, status: "Approved", progress: 100 });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).stories.find(story => story.id === createdId).status, "Approved");
  });

  await t.test("generated video is available to an independent device", async () => {
    const first = Uint8Array.from([1, 2, 3, 4]);
    const second = Uint8Array.from([5, 6, 7]);
    const headers = { "Content-Type": "video/webm", "X-Video-Language": "ur", "X-Renderer-Version": "3" };
    const firstResponse = await server.requestRaw("/api/videos?storyId=1", "PUT", first, { ...headers, "Content-Range": "bytes 0-3/7" });
    assert.equal(firstResponse.status, 202);
    assert.equal((await firstResponse.json()).complete, false);
    const finalResponse = await server.requestRaw("/api/videos?storyId=1", "PUT", second, { ...headers, "Content-Range": "bytes 4-6/7" });
    assert.equal(finalResponse.status, 201);
    assert.equal((await finalResponse.json()).complete, true);

    const phone = await server.requestRaw("/api/videos?storyId=1", "GET", undefined, { "User-Agent": "Mozilla/5.0 (iPhone)" });
    assert.equal(phone.status, 200);
    assert.equal(phone.headers.get("content-type"), "video/webm");
    assert.equal(phone.headers.get("x-video-language"), "ur");
    assert.equal(phone.headers.get("x-renderer-version"), "3");
    assert.deepEqual([...new Uint8Array(await phone.arrayBuffer())], [1, 2, 3, 4, 5, 6, 7]);

    const metadata = await server.request("/api/videos?storyId=1", "POST", { youtubeUrl: "https://youtu.be/qa-video" });
    assert.equal(metadata.status, 200);
    const shared = await server.requestRaw("/api/videos?storyId=1");
    assert.equal(shared.headers.get("x-youtube-url"), "https://youtu.be/qa-video");
  });

  await t.test("production routes enforce one proxy-safe speech segment and visual per request", async () => {
    const configured = await startServer(databasePath, undefined, [], { OPENAI_API_KEY: "qa-placeholder" });
    try {
      const visualConfig = await configured.request("/api/visuals");
      assert.equal(visualConfig.status, 200);
      assert.equal((await visualConfig.json()).ready, true);
      const speech = await configured.request("/api/speech", "POST", { language: "ur", text: "x".repeat(1401) });
      assert.equal(speech.status, 413);
      assert.match((await speech.json()).error, /1400 characters or fewer/);
      const visuals = await configured.request("/api/visuals", "POST", { title: "QA", scenes: [{}, {}] });
      assert.equal(visuals.status, 400);
      assert.match((await visuals.json()).error, /one visual scene per request/i);
    } finally { await configured.close(); }
  });

  await t.test("database persists across production server restarts", async () => {
    const before = await (await server.request()).json();
    await server.close();
    server = await startServer(databasePath, undefined, [], { ADMIN_PASSWORD: "Pass7!x" });
    assert.equal(server.loginStatus, 200);
    assert.deepEqual(await (await server.request()).json(), before);
    assert.equal((await readFile(databasePath)).subarray(0, 15).toString(), "SQLite format 3");
    const video = await server.requestRaw("/api/videos?storyId=1");
    assert.equal(video.status, 200);
    assert.deepEqual([...new Uint8Array(await video.arrayBuffer())], [1, 2, 3, 4, 5, 6, 7]);
  });

  await t.test("storage failures return an explicit non-cacheable error", async () => {
    const unavailable = await startServer(join(databasePath, "cannot-create.sqlite"));
    try {
      const response = await unavailable.unauthenticated("/api/auth/login", "POST", { email: "admin@qa.test", password: "correct-horse-battery-staple" });
      assert.equal(response.status, 503);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.match((await response.json()).error, /Sign-in is not available/);
    } finally { await unavailable.close(); }
  });

  for (const startupFile of ["app.js", "app.cjs"]) {
    await t.test(`Passenger can require ${startupFile} and serve existing stories`, async () => {
      // The CommonJS entry also works when synchronous ESM require is disabled.
      const passenger = await startServer(databasePath, startupFile,
        startupFile === "app.cjs" ? ["--no-experimental-require-module"] : []);
      try {
        assert.equal((await passenger.request("/")).status, 200);
        const response = await passenger.request();
        assert.equal(response.status, 200);
        const { stories } = await response.json();
        assert.ok(stories.some(story => story.id === createdId));
        assert.equal(stories.find(story => story.id === 1).status, "Published");
      } finally { await passenger.close(); }
    });
  }
});
