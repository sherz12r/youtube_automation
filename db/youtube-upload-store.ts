export type YoutubeUploadSession = {
  id: string;
  uploadUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: number;
};

const sessionLifetime = 24 * 60 * 60 * 1000;

function modules() {
  const fs = process.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
  const path = process.getBuiltinModule?.("node:path") as typeof import("node:path") | undefined;
  const crypto = process.getBuiltinModule?.("node:crypto") as typeof import("node:crypto") | undefined;
  if (!fs || !path || !crypto) throw new Error("YouTube upload sessions require the Node.js runtime.");
  const directory = path.resolve(process.env.YOUTUBE_UPLOAD_SESSION_PATH || path.join(process.cwd(), "data", "youtube-uploads"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { fs, path, crypto, directory };
}

function validSessionId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

function sessionPath(id: string) {
  if (!validSessionId(id)) throw new Error("Invalid YouTube upload session.");
  const { path, directory } = modules();
  return path.join(directory, `${id}.json`);
}

function validGoogleUploadUrl(value: string) {
  const url = new URL(value);
  const googleHost = url.hostname === "www.googleapis.com" || url.hostname.endsWith(".googleapis.com") || url.hostname.endsWith(".googleusercontent.com");
  if (url.protocol !== "https:" || !googleHost) throw new Error("YouTube returned an invalid upload destination.");
  return url.toString();
}

export async function createYoutubeUploadSession(uploadUrl: string, fileSize: number, mimeType: string) {
  if (!Number.isSafeInteger(fileSize) || fileSize < 1) throw new Error("Invalid YouTube video size.");
  const { fs, crypto } = modules();
  const session: YoutubeUploadSession = {
    id: crypto.randomUUID(),
    uploadUrl: validGoogleUploadUrl(uploadUrl),
    fileSize,
    mimeType,
    createdAt: Date.now(),
  };
  await fs.promises.writeFile(sessionPath(session.id), JSON.stringify(session), { encoding: "utf8", flag: "wx", mode: 0o600 });
  return session;
}

export async function getYoutubeUploadSession(id: string) {
  const { fs } = modules();
  let session: YoutubeUploadSession;
  try { session = JSON.parse(await fs.promises.readFile(sessionPath(id), "utf8")) as YoutubeUploadSession; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  if (session.id !== id || !Number.isSafeInteger(session.fileSize) || session.fileSize < 1
    || typeof session.mimeType !== "string" || Date.now() - session.createdAt > sessionLifetime) {
    await deleteYoutubeUploadSession(id);
    return null;
  }
  session.uploadUrl = validGoogleUploadUrl(session.uploadUrl);
  return session;
}

export async function deleteYoutubeUploadSession(id: string) {
  const { fs } = modules();
  await fs.promises.rm(sessionPath(id), { force: true });
}
