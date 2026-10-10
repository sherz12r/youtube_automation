type VideoLanguage = "ur" | "en";

export type StoredVideoMetadata = {
  storyId: number;
  language: VideoLanguage;
  rendererVersion: number;
  mimeType: "video/webm";
  size: number;
  updatedAt: number;
  youtubeUrl?: string;
};

const maximumVideoSize = 512 * 1024 * 1024;
const maximumChunkSize = 2 * 1024 * 1024;

function modules() {
  const fs = process.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
  const path = process.getBuiltinModule?.("node:path") as typeof import("node:path") | undefined;
  if (!fs || !path) throw new Error("Shared video storage requires the Node.js runtime.");
  const directory = path.resolve(process.env.VIDEO_STORAGE_PATH || path.join(process.cwd(), "data", "videos"));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  return { fs, path, directory };
}

function paths(storyId: number) {
  if (!Number.isSafeInteger(storyId) || storyId <= 0) throw new Error("Invalid story ID.");
  const { path, directory } = modules();
  return {
    video: path.join(directory, `${storyId}.webm`),
    partial: path.join(directory, `${storyId}.webm.part`),
    metadata: path.join(directory, `${storyId}.json`),
    metadataPartial: path.join(directory, `${storyId}.json.part`),
  };
}

async function writeMetadata(metadataPath: string, temporaryPath: string, metadata: StoredVideoMetadata) {
  const { fs } = modules();
  await fs.promises.writeFile(temporaryPath, JSON.stringify(metadata), { encoding: "utf8", mode: 0o600 });
  await fs.promises.rm(metadataPath, { force: true });
  await fs.promises.rename(temporaryPath, metadataPath);
}

export function parseVideoRange(value: string | null) {
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(value || "");
  if (!match) throw new Error("A valid video Content-Range is required.");
  const start = Number(match[1]), end = Number(match[2]), total = Number(match[3]);
  if (![start, end, total].every(Number.isSafeInteger) || start < 0 || end < start || total <= end || total > maximumVideoSize) {
    throw new Error("The video byte range is invalid or too large.");
  }
  if (end - start + 1 > maximumChunkSize) throw new Error("Video chunks must be 2 MB or smaller.");
  return { start, end, total };
}

export async function writeVideoChunk(input: {
  storyId: number;
  language: VideoLanguage;
  rendererVersion: number;
  contentRange: string | null;
  bytes: Uint8Array;
}) {
  const { fs } = modules();
  const filePaths = paths(input.storyId);
  const range = parseVideoRange(input.contentRange);
  if (input.bytes.byteLength !== range.end - range.start + 1) throw new Error("The video chunk length does not match its byte range.");
  if (!Number.isSafeInteger(input.rendererVersion) || input.rendererVersion < 1) throw new Error("Invalid video renderer version.");

  if (range.start === 0) {
    await fs.promises.writeFile(filePaths.partial, input.bytes, { mode: 0o600 });
  } else {
    let size = 0;
    try { size = (await fs.promises.stat(filePaths.partial)).size; }
    catch { throw new Error("The video upload session expired. Start the upload again."); }
    if (size !== range.start) {
      if (size === range.end + 1) return { complete: false, received: size, total: range.total };
      throw new Error("The video chunks arrived out of order. Start the upload again.");
    }
    await fs.promises.appendFile(filePaths.partial, input.bytes);
  }

  const received = (await fs.promises.stat(filePaths.partial)).size;
  if (received !== range.end + 1) throw new Error("The video chunk could not be saved completely.");
  if (received < range.total) return { complete: false, received, total: range.total };

  await fs.promises.rm(filePaths.video, { force: true });
  await fs.promises.rename(filePaths.partial, filePaths.video);
  const metadata: StoredVideoMetadata = {
    storyId: input.storyId,
    language: input.language,
    rendererVersion: input.rendererVersion,
    mimeType: "video/webm",
    size: received,
    updatedAt: Date.now(),
  };
  await writeMetadata(filePaths.metadata, filePaths.metadataPartial, metadata);
  return { complete: true, received, total: range.total };
}

export async function readVideo(storyId: number) {
  const { fs } = modules();
  const filePaths = paths(storyId);
  try {
    const [rawMetadata, stat] = await Promise.all([
      fs.promises.readFile(filePaths.metadata, "utf8"),
      fs.promises.stat(filePaths.video),
    ]);
    const metadata = JSON.parse(rawMetadata) as StoredVideoMetadata;
    if (metadata.storyId !== storyId || metadata.mimeType !== "video/webm" || metadata.size !== stat.size
      || !["ur", "en"].includes(metadata.language) || !Number.isSafeInteger(metadata.rendererVersion)) return null;
    return { path: filePaths.video, metadata };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function updateVideoYoutubeUrl(storyId: number, youtubeUrl: string) {
  const current = await readVideo(storyId);
  if (!current) return false;
  const url = new URL(youtubeUrl);
  if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com", "youtu.be"].includes(url.hostname)) {
    throw new Error("Invalid YouTube video URL.");
  }
  const filePaths = paths(storyId);
  await writeMetadata(filePaths.metadata, filePaths.metadataPartial, { ...current.metadata, youtubeUrl: url.toString(), updatedAt: Date.now() });
  return true;
}

export function createVideoReadStream(path: string) {
  const { fs } = modules();
  return fs.createReadStream(path);
}
