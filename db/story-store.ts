import type { DatabaseSync } from "node:sqlite";
import { initialStories } from "../lib/story-defaults";
import { storyKey, type Story } from "../lib/stories";

type Row = { id: number; data: string };
type Statement = { sql: string; values: (string | number)[] };
// The small common SQL surface works with cPanel SQLite and the existing
// Cloudflare Worker build, without importing Node-only code in a Worker.
type D1Binding = {
  prepare(sql: string): {
    bind(...values: (string | number)[]): ReturnType<D1Binding["prepare"]>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
  batch(statements: ReturnType<D1Binding["prepare"]>[]): Promise<unknown>;
};
let cloudflareDb: D1Binding | undefined;
let sqliteDb: DatabaseSync | undefined;
let initialization: Promise<void> | undefined;

export function bindStoryDatabase(db: D1Binding) {
  cloudflareDb = db;
}

function sqlite() {
  if (sqliteDb) return sqliteDb;
  const sqliteModule = process.getBuiltinModule?.("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqliteModule) throw new Error("Story storage requires Node.js 22.13+ or a D1 DB binding.");
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const filename = path.resolve(process.env.STORY_DATABASE_PATH || path.join(process.cwd(), "data", "stories.sqlite"));
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const db = new sqliteModule.DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  } catch (error) {
    db.close();
    throw error;
  }
  sqliteDb = db;
  return db;
}

async function batch(statements: Statement[]) {
  if (cloudflareDb) {
    await cloudflareDb.batch(statements.map(({ sql, values }) => cloudflareDb!.prepare(sql).bind(...values)));
    return;
  }
  const db = sqlite();
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const { sql, values } of statements) db.prepare(sql).run(...values);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function insertion(story: Story, timestamp: number, importing = false): Statement {
  // Keep legacy IDs for this browser's saved video references. If two browsers
  // generated different titles in the same millisecond, allocate a fresh ID.
  return {
    sql: `INSERT INTO stories (id, story_key, data, updated_at)
      VALUES (CASE WHEN EXISTS (SELECT 1 FROM stories WHERE id = ?)
        THEN max(?, (SELECT coalesce(max(id), 0) + 1 FROM stories)) ELSE ? END, ?, ?, ?)
      ON CONFLICT(story_key) DO ${importing
        ? "UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE stories.updated_at = 0"
        : "NOTHING"}`,
    values: [story.id, story.id, story.id, storyKey(story), JSON.stringify(story), timestamp],
  };
}

async function initialize() {
  initialization ??= (async () => {
    await batch([{
      sql: `CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY NOT NULL,
        story_key TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0
      )`, values: [],
    }, ...initialStories.map(story => insertion(story, 0))]);
  })().catch(error => { initialization = undefined; throw error; });
  await initialization;
}

export async function listStories(): Promise<Story[]> {
  await initialize();
  const sql = "SELECT id, data FROM stories ORDER BY id DESC";
  const rows = cloudflareDb
    ? (await cloudflareDb.prepare(sql).all<Row>()).results
    : sqlite().prepare(sql).all() as Row[];
  return rows.map(row => ({ ...JSON.parse(row.data), id: row.id }));
}

export async function importStories(stories: Story[]) {
  await initialize();
  if (stories.length) await batch(stories.map(story => {
    const seed = initialStories.find(initial => storyKey(initial) === storyKey(story));
    const unchangedSeed = seed && seed.status === story.status && seed.progress === story.progress;
    // A fresh browser's old starter snapshot must not prevent a later import
    // of the owner's reviewed starter stories.
    return insertion(story, unchangedSeed ? 0 : Date.now(), true);
  }));
  return listStories();
}

export async function createStory(story: Story) {
  await initialize();
  await batch([insertion({ ...story, id: Date.now(), status: "Needs review", progress: 68 }, Date.now())]);
  const stories = await listStories();
  return { stories, storyId: stories.find(saved => storyKey(saved) === storyKey(story))!.id };
}

export async function updateStoryStatus(id: number, status: Story["status"], progress: number) {
  await initialize();
  await batch([{
    sql: "UPDATE stories SET data = json_set(data, '$.status', ?, '$.progress', ?), updated_at = ? WHERE id = ?",
    values: [status, progress, Date.now(), id],
  }]);
  return listStories();
}
