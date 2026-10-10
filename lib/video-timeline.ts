export const MAX_VIDEO_SCENES = 10;

export function groupStoryMoments(parts: string[], maxScenes = MAX_VIDEO_SCENES) {
  const words = parts.join(" ").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const sceneCount = Math.min(maxScenes, Math.max(1, Math.ceil(words.length / 28)));
  return Array.from({ length: sceneCount }, (_, index) => {
    const start = Math.floor(index * words.length / sceneCount);
    const end = Math.floor((index + 1) * words.length / sceneCount);
    return words.slice(start, Math.max(start + 1, end)).join(" ");
  }).filter(Boolean);
}

export function scenePositionAtRatio(sceneCount: number, ratio: number) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new Error("A video needs at least one scene.");
  }
  const clamped = Math.max(0, Math.min(0.999999, ratio));
  const position = clamped * sceneCount;
  const index = Math.min(sceneCount - 1, Math.floor(position));
  return { index, sceneRatio: position - index };
}
