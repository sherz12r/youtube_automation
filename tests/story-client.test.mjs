import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

await mkdir(resolve("work"), { recursive: true });
const directory = await mkdtemp(resolve("work/story-client-test-"));
for (const name of ["stories", "story-defaults", "story-client"]) {
  const source = await readFile(new URL(`../lib/${name}.ts`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  await writeFile(resolve(directory, `${name}.mjs`), outputText.replace(/from "(\.\/[^".]+)"/g, 'from "$1.mjs"'));
}
const { initialStories } = await import(pathToFileURL(resolve(directory, "story-defaults.mjs")));
const { legacyStories } = await import(pathToFileURL(resolve(directory, "stories.mjs")));
const { importBrowserStories, storyRequest } = await import(pathToFileURL(resolve(directory, "story-client.mjs")));

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
  });
});
