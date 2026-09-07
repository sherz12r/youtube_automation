import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

async function startServer(databasePath) {
  const child = fork(new URL("./helpers/story-server.mjs", import.meta.url), [], {
    silent: true,
    env: { ...process.env, STORY_DATABASE_PATH: databasePath },
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
    return {
      async request(path = "/api/stories", method = "GET", body, headers = {}) {
        return fetch(`http://127.0.0.1:${port}${path}`, {
          method,
          headers: { "Content-Type": "application/json", ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      },
      async close() { if (child.exitCode !== null) return; const exited = once(child, "exit"); child.kill(); await exited; },
    };
  } finally { clearTimeout(timeout); }
}

test("shared stories survive fresh-device reads, concurrent saves, imports and server restarts", async t => {
  await mkdir(resolve("work"), { recursive: true });
  const directory = await mkdtemp(resolve("work/story-test-"));
  const databasePath = join(directory, "stories.sqlite");
  let server = await startServer(databasePath);
  t.after(async () => { await server.close(); });
  let createdId;
  let initial;

  await t.test("production HTML renders the story studio", async () => {
    const response = await server.request("/");
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Noor Studio/);
    assert.match(html, /Story queue/);
    assert.match(html, /Loading shared stories/);
    assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
  });

  await t.test("GET seeds one shared queue and disables caching", async () => {
    const response = await server.request();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("cdn-cache-control"), "no-store");
    initial = (await response.json()).stories;
    assert.equal(initial.length, 3);
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
    assert.equal((await server.request("/api/stories", "POST", { story: initial[0] }, { "sec-fetch-site": "cross-site" })).status, 400);
    assert.equal((await server.request("/api/stories", "PATCH", { id: -1, status: "Approved", progress: 100 })).status, 400);
    assert.equal((await server.request("/api/stories", "PATCH", { id: 42, status: "Approved", progress: 100 })).status, 404);
    assert.deepEqual(await (await server.request()).json(), before);
  });

  await t.test("database persists across production server restarts", async () => {
    const before = await (await server.request()).json();
    await server.close();
    server = await startServer(databasePath);
    assert.deepEqual(await (await server.request()).json(), before);
    assert.equal((await readFile(databasePath)).subarray(0, 15).toString(), "SQLite format 3");
  });

  await t.test("storage failures return an explicit non-cacheable error", async () => {
    const unavailable = await startServer(join(databasePath, "cannot-create.sqlite"));
    try {
      const response = await unavailable.request();
      assert.equal(response.status, 503);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.match((await response.json()).error, /could not be saved or loaded/);
    } finally { await unavailable.close(); }
  });
});
