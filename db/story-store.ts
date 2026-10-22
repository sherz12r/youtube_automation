import type { DatabaseSync } from "node:sqlite";
import { initialStories } from "../lib/story-defaults";
import { storyKey, type Story } from "../lib/stories";

type SqlValue = string | number | null;
type Row = { id: number; data: string };
type Statement = { sql: string; values: SqlValue[] };
type D1Binding = {
  prepare(sql: string): {
    bind(...values: SqlValue[]): ReturnType<D1Binding["prepare"]>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
  batch(statements: ReturnType<D1Binding["prepare"]>[]): Promise<unknown>;
};

let cloudflareDb: D1Binding | undefined;
let sqliteDb: DatabaseSync | undefined;
let initialization: Promise<void> | undefined;

export function bindStoryDatabase(db: D1Binding) { cloudflareDb = db; }

function sqlite() {
  if (sqliteDb) return sqliteDb;
  const sqliteModule = process.getBuiltinModule?.("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqliteModule) throw new Error("Story storage requires Node.js 22.13+ or a D1 DB binding.");
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const filename = path.resolve(process.env.STORY_DATABASE_PATH || path.join(process.cwd(), "data", "stories.sqlite"));
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  sqliteDb = new sqliteModule.DatabaseSync(filename);
  sqliteDb.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
  return sqliteDb;
}

async function all<T>(sql: string, values: SqlValue[] = []) {
  if (cloudflareDb) return (await cloudflareDb.prepare(sql).bind(...values).all<T>()).results;
  return sqlite().prepare(sql).all(...values) as T[];
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
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

function insertion(ownerId: string, story: Story, timestamp: number, importing = false): Statement {
  return {
    sql: `INSERT INTO stories (id, owner_id, story_key, data, updated_at)
      VALUES (CASE WHEN EXISTS (SELECT 1 FROM stories WHERE id = ?)
        THEN max(?, (SELECT coalesce(max(id), 0) + 1 FROM stories)) ELSE ? END, ?, ?, ?, ?)
      ON CONFLICT(owner_id, story_key) DO ${importing
        ? "UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE stories.updated_at = 0"
        : "NOTHING"}`,
    values: [story.id, story.id, story.id, ownerId, storyKey(story), JSON.stringify(story), timestamp],
  };
}

async function initialize() {
  initialization ??= (async () => {
    const columns = await all<{ name: string }>("PRAGMA table_info(stories)");
    if (columns.length && !columns.some(column => column.name === "owner_id")) {
      await batch([
        { sql: "ALTER TABLE stories RENAME TO stories_legacy", values: [] },
        { sql: `CREATE TABLE stories (id INTEGER PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, story_key TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0, UNIQUE(owner_id, story_key))`, values: [] },
        { sql: "INSERT INTO stories (id,owner_id,story_key,data,updated_at) SELECT id,'__legacy__',story_key,data,updated_at FROM stories_legacy", values: [] },
        { sql: "DROP TABLE stories_legacy", values: [] },
      ]);
    } else if (!columns.length) {
      await batch([{ sql: `CREATE TABLE IF NOT EXISTS stories (
        id INTEGER PRIMARY KEY NOT NULL,
        owner_id TEXT NOT NULL,
        story_key TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL DEFAULT 0,
        UNIQUE(owner_id, story_key)
      )`, values: [] }]);
    }
    await batch([{ sql: "CREATE INDEX IF NOT EXISTS stories_owner_id_idx ON stories(owner_id)", values: [] }]);
  })().catch(error => { initialization = undefined; throw error; });
  await initialization;
}

async function ensureTenant(ownerId: string, claimLegacy = false) {
  await initialize();
  if (claimLegacy) await batch([{ sql: "UPDATE stories SET owner_id = ? WHERE owner_id = '__legacy__'", values: [ownerId] }]);
  const count = (await all<{ total: number }>("SELECT count(*) AS total FROM stories WHERE owner_id = ?", [ownerId]))[0]?.total ?? 0;
  if (!count) await batch(initialStories.map(story => insertion(ownerId, story, 0)));
}

export async function listStories(ownerId: string, claimLegacy = false): Promise<Story[]> {
  await ensureTenant(ownerId, claimLegacy);
  const rows = await all<Row>("SELECT id, data FROM stories WHERE owner_id = ? ORDER BY id DESC", [ownerId]);
  return rows.map(row => ({ ...JSON.parse(row.data), id: row.id }));
}

export async function importStories(ownerId: string, stories: Story[], claimLegacy = false) {
  await ensureTenant(ownerId, claimLegacy);
  if (stories.length) await batch(stories.map(story => {
    const seed = initialStories.find(initial => storyKey(initial) === storyKey(story));
    const unchangedSeed = seed && seed.status === story.status && seed.progress === story.progress;
    return insertion(ownerId, story, unchangedSeed ? 0 : Date.now(), true);
  }));
  return listStories(ownerId);
}

export async function createStory(ownerId: string, story: Story) {
  await ensureTenant(ownerId);
  const createdAt = Date.now();
  await batch([insertion(ownerId, { ...story, id: createdAt, createdAt, status: "Needs review", progress: 68 }, createdAt)]);
  const stories = await listStories(ownerId);
  return { stories, storyId: stories.find(saved => storyKey(saved) === storyKey(story))!.id };
}

export async function updateStoryStatus(ownerId: string, id: number, status: Story["status"], progress: number) {
  await ensureTenant(ownerId);
  await batch([{
    sql: "UPDATE stories SET data = json_set(data, '$.status', ?, '$.progress', ?), updated_at = ? WHERE id = ? AND owner_id = ?",
    values: [status, progress, Date.now(), id, ownerId],
  }]);
  return listStories(ownerId);
}

export async function tenantOwnsStory(ownerId: string, id: number) {
  await initialize();
  return Boolean((await all<{ id: number }>("SELECT id FROM stories WHERE id = ? AND owner_id = ? LIMIT 1", [id, ownerId]))[0]);
}
