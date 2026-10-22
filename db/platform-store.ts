import type { DatabaseSync } from "node:sqlite";

type SqlValue = string | number | null;
type D1Binding = {
  prepare(sql: string): {
    bind(...values: SqlValue[]): ReturnType<D1Binding["prepare"]>;
    all<T>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
};

export type UserRole = "admin" | "user";
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "canceled";

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: number | null;
  createdAt: number;
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  password_salt: string;
  password_hash: string;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: number | null;
  created_at: number;
};

type ProfileRow = {
  user_id: string;
  channel_name: string;
  channel_topic: string;
  target_audience: string;
  content_language: string;
  content_tone: string;
  upload_privacy: string;
  posting_schedule: string;
  youtube_channel_id: string;
  youtube_refresh_token: string | null;
  updated_at: number;
};

export type ChannelProfile = {
  channelName: string;
  channelTopic: string;
  targetAudience: string;
  contentLanguage: string;
  contentTone: string;
  uploadPrivacy: "private" | "unlisted" | "public";
  postingSchedule: string;
  youtubeChannelId: string;
  youtubeConnected: boolean;
  updatedAt: number;
};

let cloudflareDb: D1Binding | undefined;
let sqliteDb: DatabaseSync | undefined;
let initialization: Promise<void> | undefined;

export function bindPlatformDatabase(db: D1Binding) {
  cloudflareDb = db;
}

function sqlite() {
  if (sqliteDb) return sqliteDb;
  const sqliteModule = process.getBuiltinModule?.("node:sqlite") as typeof import("node:sqlite") | undefined;
  if (!sqliteModule) throw new Error("Account storage requires Node.js 22.13+ or a D1 DB binding.");
  const fs = process.getBuiltinModule("node:fs") as typeof import("node:fs");
  const path = process.getBuiltinModule("node:path") as typeof import("node:path");
  const filename = path.resolve(process.env.STORY_DATABASE_PATH || path.join(process.cwd(), "data", "stories.sqlite"));
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  sqliteDb = new sqliteModule.DatabaseSync(filename);
  sqliteDb.exec("PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  return sqliteDb;
}

async function run(sql: string, values: SqlValue[] = []) {
  if (cloudflareDb) return cloudflareDb.prepare(sql).bind(...values).run();
  return sqlite().prepare(sql).run(...values);
}

async function all<T>(sql: string, values: SqlValue[] = []) {
  if (cloudflareDb) return (await cloudflareDb.prepare(sql).bind(...values).all<T>()).results;
  return sqlite().prepare(sql).all(...values) as T[];
}

const encoder = new TextEncoder();
const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const fromHex = (value: string) => Uint8Array.from(value.match(/.{2}/g)?.map(byte => Number.parseInt(byte, 16)) ?? []);

async function passwordDigest(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(saltHex), iterations: 210_000 }, key, 256);
  return toHex(new Uint8Array(bits));
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = toHex(salt);
  return { salt: saltHex, hash: await passwordDigest(password, saltHex) };
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

function validPassword(password: string) {
  return password.length >= 7 && password.length <= 200;
}

function safeUser(row: UserRow): SafeUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    subscriptionStatus: row.subscription_status,
    subscriptionEndsAt: row.subscription_ends_at,
    createdAt: row.created_at,
  };
}

async function initialize() {
  initialization ??= (async () => {
    await run(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','user')),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      subscription_status TEXT NOT NULL CHECK(subscription_status IN ('active','trialing','past_due','canceled')),
      subscription_ends_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    await run(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    await run("CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)");
    await run(`CREATE TABLE IF NOT EXISTS channel_profiles (
      user_id TEXT PRIMARY KEY NOT NULL,
      channel_name TEXT NOT NULL DEFAULT '',
      channel_topic TEXT NOT NULL DEFAULT '',
      target_audience TEXT NOT NULL DEFAULT '',
      content_language TEXT NOT NULL DEFAULT 'English',
      content_tone TEXT NOT NULL DEFAULT 'Educational and engaging',
      upload_privacy TEXT NOT NULL DEFAULT 'private',
      posting_schedule TEXT NOT NULL DEFAULT '3 videos per week',
      youtube_channel_id TEXT NOT NULL DEFAULT '',
      youtube_refresh_token TEXT,
      updated_at INTEGER NOT NULL DEFAULT 0
    )`);

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const adminPassword = process.env.ADMIN_PASSWORD ?? "";
    const existing = (await all<UserRow>("SELECT * FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1"))[0];
    if (!existing && adminEmail && validPassword(adminPassword)) {
      const now = Date.now();
      const password = await hashPassword(adminPassword);
      await run(`INSERT INTO users (id,email,name,role,password_salt,password_hash,subscription_status,subscription_ends_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), adminEmail, process.env.ADMIN_NAME?.trim() || "Main administrator", "admin", password.salt, password.hash, "active", null, now, now]);
    } else if (existing && adminEmail && validPassword(adminPassword)) {
      const configuredName = process.env.ADMIN_NAME?.trim() || existing.name;
      const configuredDigest = await passwordDigest(adminPassword, existing.password_salt);
      let salt = existing.password_salt;
      let hash = existing.password_hash;
      if (!constantTimeEqual(configuredDigest, existing.password_hash)) {
        const password = await hashPassword(adminPassword);
        salt = password.salt;
        hash = password.hash;
      }
      if (existing.email !== adminEmail || existing.name !== configuredName || hash !== existing.password_hash
        || existing.subscription_status !== "active" || existing.subscription_ends_at !== null) {
        await run(`UPDATE users SET email=?,name=?,password_salt=?,password_hash=?,subscription_status='active',subscription_ends_at=NULL,updated_at=? WHERE id=?`,
          [adminEmail, configuredName, salt, hash, Date.now(), existing.id]);
      }
    }
  })().catch(error => { initialization = undefined; throw error; });
  await initialization;
}

export function subscriptionActive(user: SafeUser, now = Date.now()) {
  return user.role === "admin" || ((user.subscriptionStatus === "active" || user.subscriptionStatus === "trialing")
    && (!user.subscriptionEndsAt || user.subscriptionEndsAt > now));
}

export async function verifyCredentials(email: string, password: string) {
  await initialize();
  const rows = await all<UserRow>("SELECT * FROM users WHERE email = ? LIMIT 1", [email.trim().toLowerCase()]);
  const row = rows[0];
  if (!row) {
    await passwordDigest(password.slice(0, 200), "00000000000000000000000000000000");
    return null;
  }
  const digest = await passwordDigest(password, row.password_salt);
  return constantTimeEqual(digest, row.password_hash) ? safeUser(row) : null;
}

export async function createSession(userId: string, tokenHash: string, expiresAt: number) {
  await initialize();
  await run("DELETE FROM sessions WHERE expires_at <= ?", [Date.now()]);
  await run("INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)", [tokenHash, userId, expiresAt, Date.now()]);
}

export async function userForSession(tokenHash: string) {
  await initialize();
  const rows = await all<UserRow>(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? LIMIT 1`, [tokenHash, Date.now()]);
  return rows[0] ? safeUser(rows[0]) : null;
}

export async function deleteSession(tokenHash: string) {
  await initialize();
  await run("DELETE FROM sessions WHERE token_hash = ?", [tokenHash]);
}

export async function listUsers() {
  await initialize();
  const rows = await all<UserRow>("SELECT * FROM users ORDER BY role ASC, created_at DESC");
  return rows.map(safeUser);
}

export async function createUser(input: { email: string; name: string; password: string; subscriptionEndsAt: number | null }) {
  await initialize();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  if (name.length < 2 || name.length > 100) throw new Error("Name must be between 2 and 100 characters.");
  if (!validPassword(input.password)) throw new Error("Password must be at least 7 characters.");
  if (input.subscriptionEndsAt !== null && (!Number.isSafeInteger(input.subscriptionEndsAt) || input.subscriptionEndsAt <= Date.now())) throw new Error("Subscription end date must be in the future.");
  const password = await hashPassword(input.password);
  const now = Date.now();
  try {
    await run(`INSERT INTO users (id,email,name,role,password_salt,password_hash,subscription_status,subscription_ends_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, [crypto.randomUUID(), email, name, "user", password.salt, password.hash, "active", input.subscriptionEndsAt, now, now]);
  } catch (error) {
    if (/unique|constraint/i.test(String(error))) throw new Error("A user with this email already exists.");
    throw error;
  }
  return (await listUsers()).find(user => user.email === email)!;
}

export async function updateUser(input: { id: string; name?: string; password?: string; subscriptionStatus?: SubscriptionStatus; subscriptionEndsAt?: number | null }) {
  await initialize();
  const current = (await all<UserRow>("SELECT * FROM users WHERE id = ? LIMIT 1", [input.id]))[0];
  if (!current) throw new Error("User not found.");
  if (current.role === "admin" && input.subscriptionStatus && input.subscriptionStatus !== "active") throw new Error("The main administrator cannot be suspended.");
  const name = input.name === undefined ? current.name : input.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error("Name must be between 2 and 100 characters.");
  const status = input.subscriptionStatus ?? current.subscription_status;
  const endsAt = input.subscriptionEndsAt === undefined ? current.subscription_ends_at : input.subscriptionEndsAt;
  if (!(["active", "trialing", "past_due", "canceled"] as string[]).includes(status)) throw new Error("Invalid subscription status.");
  let salt = current.password_salt, hash = current.password_hash;
  if (input.password) {
    if (!validPassword(input.password)) throw new Error("Password must be at least 7 characters.");
    const next = await hashPassword(input.password); salt = next.salt; hash = next.hash;
  }
  await run(`UPDATE users SET name=?,password_salt=?,password_hash=?,subscription_status=?,subscription_ends_at=?,updated_at=? WHERE id=?`,
    [name, salt, hash, status, endsAt, Date.now(), input.id]);
  if (!subscriptionActive({ ...safeUser(current), name, subscriptionStatus: status, subscriptionEndsAt: endsAt })) {
    await run("DELETE FROM sessions WHERE user_id = ?", [input.id]);
  }
  return (await listUsers()).find(user => user.id === input.id)!;
}

function encryptionSecret() {
  const secret = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim() || process.env.ADMIN_PASSWORD || "";
  if (secret.length < 12) throw new Error("Set YOUTUBE_TOKEN_ENCRYPTION_KEY to a long random value before connecting YouTube.");
  return secret;
}

async function encryptionKey() {
  return crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", encoder.encode(encryptionSecret())), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `v1.${toHex(iv)}.${toHex(new Uint8Array(encrypted))}`;
}

async function decrypt(value: string) {
  const [version, iv, ciphertext] = value.split(".");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Stored YouTube authorization is invalid.");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(iv) }, await encryptionKey(), fromHex(ciphertext));
  return new TextDecoder().decode(decrypted);
}

const defaultProfile = (): ChannelProfile => ({
  channelName: "", channelTopic: "", targetAudience: "", contentLanguage: "English",
  contentTone: "Educational and engaging", uploadPrivacy: "private", postingSchedule: "3 videos per week",
  youtubeChannelId: "", youtubeConnected: false, updatedAt: 0,
});

function safeProfile(row?: ProfileRow): ChannelProfile {
  if (!row) return defaultProfile();
  return {
    channelName: row.channel_name, channelTopic: row.channel_topic, targetAudience: row.target_audience,
    contentLanguage: row.content_language, contentTone: row.content_tone,
    uploadPrivacy: (["private", "unlisted", "public"].includes(row.upload_privacy) ? row.upload_privacy : "private") as ChannelProfile["uploadPrivacy"],
    postingSchedule: row.posting_schedule, youtubeChannelId: row.youtube_channel_id,
    youtubeConnected: Boolean(row.youtube_refresh_token), updatedAt: row.updated_at,
  };
}

function validRefreshToken(value: string | undefined) {
  const token = value?.trim() || "";
  return token.length >= 20 && token.length <= 4096 ? token : null;
}

async function environmentAdminRefreshToken(userId: string) {
  const token = validRefreshToken(process.env.YOUTUBE_REFRESH_TOKEN);
  if (!token) return null;
  const user = (await all<{ role: UserRole }>("SELECT role FROM users WHERE id = ? LIMIT 1", [userId]))[0];
  return user?.role === "admin" ? token : null;
}

export async function getChannelProfile(userId: string) {
  await initialize();
  const row = (await all<ProfileRow>("SELECT * FROM channel_profiles WHERE user_id = ? LIMIT 1", [userId]))[0];
  const profile = safeProfile(row);
  // Support an existing server-level token for the main administrator only.
  // An explicit disconnect stores an empty string and disables this fallback.
  if (!profile.youtubeConnected && row?.youtube_refresh_token !== "") {
    profile.youtubeConnected = Boolean(await environmentAdminRefreshToken(userId));
  }
  return profile;
}

export async function updateChannelProfile(userId: string, input: Partial<Omit<ChannelProfile, "youtubeConnected" | "updatedAt">> & { youtubeRefreshToken?: string; disconnectYoutube?: boolean }) {
  await initialize();
  const currentRows = await all<ProfileRow>("SELECT * FROM channel_profiles WHERE user_id = ? LIMIT 1", [userId]);
  const current = safeProfile(currentRows[0]);
  const clean = (value: unknown, fallback: string, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : fallback;
  const privacy = ["private", "unlisted", "public"].includes(String(input.uploadPrivacy)) ? String(input.uploadPrivacy) : current.uploadPrivacy;
  let refreshToken = currentRows[0]?.youtube_refresh_token ?? null;
  if (input.disconnectYoutube) refreshToken = "";
  else if (input.youtubeRefreshToken !== undefined) {
    const token = input.youtubeRefreshToken.trim();
    if (token.length < 20 || token.length > 4096) throw new Error("Enter a valid YouTube refresh token.");
    refreshToken = await encrypt(token);
  }
  const values: SqlValue[] = [
    userId, clean(input.channelName, current.channelName, 100), clean(input.channelTopic, current.channelTopic, 500),
    clean(input.targetAudience, current.targetAudience, 300), clean(input.contentLanguage, current.contentLanguage, 80),
    clean(input.contentTone, current.contentTone, 200), privacy, clean(input.postingSchedule, current.postingSchedule, 120),
    clean(input.youtubeChannelId, current.youtubeChannelId, 100), refreshToken, Date.now(),
  ];
  await run(`INSERT INTO channel_profiles (user_id,channel_name,channel_topic,target_audience,content_language,content_tone,upload_privacy,posting_schedule,youtube_channel_id,youtube_refresh_token,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET channel_name=excluded.channel_name,channel_topic=excluded.channel_topic,
    target_audience=excluded.target_audience,content_language=excluded.content_language,content_tone=excluded.content_tone,upload_privacy=excluded.upload_privacy,
    posting_schedule=excluded.posting_schedule,youtube_channel_id=excluded.youtube_channel_id,youtube_refresh_token=excluded.youtube_refresh_token,updated_at=excluded.updated_at`, values);
  return getChannelProfile(userId);
}

export async function getYoutubeRefreshToken(userId: string) {
  await initialize();
  const row = (await all<{ youtube_refresh_token: string | null }>("SELECT youtube_refresh_token FROM channel_profiles WHERE user_id = ? LIMIT 1", [userId]))[0];
  if (row?.youtube_refresh_token === "") return null;
  if (row?.youtube_refresh_token) return decrypt(row.youtube_refresh_token);
  return environmentAdminRefreshToken(userId);
}

export async function primaryAdminId() {
  await initialize();
  return (await all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1"))[0]?.id ?? null;
}
