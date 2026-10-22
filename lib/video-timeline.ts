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

export type SceneMotionAction = "pray" | "walk" | "run" | "serve" | "reconcile" | "gesture" | "observe";
export type SceneMotionEnvironment = "dust" | "embers" | "waves" | "light" | "crowd" | "haze";

export type SceneMotionProfile = {
  action: SceneMotionAction;
  environment: SceneMotionEnvironment;
  actorCount: number;
  speed: number;
};

/**
 * Maps the story classifier to motion that can be rendered continuously on the
 * browser canvas. Keeping this mapping pure makes it possible to verify that a
 * prayer scene cannot silently fall back to a static photo transition.
 */
export function sceneMotionProfile(kind: string, prophetPresent = false): SceneMotionProfile {
  switch (kind) {
    case "prayer": return { action: "pray", environment: "light", actorCount: 1, speed: 0.75 };
    case "faith": return { action: "pray", environment: "light", actorCount: 4, speed: 0.65 };
    case "journey": return { action: "walk", environment: "dust", actorCount: prophetPresent ? 3 : 2, speed: 1 };
    case "escape": return { action: "run", environment: "dust", actorCount: 4, speed: 1.35 };
    case "rescue": return { action: "walk", environment: "waves", actorCount: 4, speed: 0.8 };
    case "sea": return { action: "gesture", environment: "waves", actorCount: prophetPresent ? 1 : 2, speed: 0.9 };
    case "service": return { action: "serve", environment: "embers", actorCount: 2, speed: 0.8 };
    case "forgiveness": return { action: "reconcile", environment: "light", actorCount: 2, speed: 0.7 };
    case "mountain": return { action: "gesture", environment: "embers", actorCount: 1, speed: 0.75 };
    case "miracle":
    case "revelation": return { action: "gesture", environment: "light", actorCount: prophetPresent ? 1 : 2, speed: 0.8 };
    case "contest":
    case "court":
    case "oppression": return { action: prophetPresent ? "gesture" : "observe", environment: "crowd", actorCount: 3, speed: 0.7 };
    case "hardship": return { action: prophetPresent ? "pray" : "observe", environment: "haze", actorCount: 1, speed: 0.55 };
    default: return { action: prophetPresent ? "gesture" : "observe", environment: "haze", actorCount: prophetPresent ? 1 : 2, speed: 0.65 };
  }
}

export function loopingMotionPhase(progress: number, speed = 1, offset = 0) {
  const normalized = Math.max(0, Math.min(1, progress));
  return ((normalized * speed + offset) % 1 + 1) % 1;
}
