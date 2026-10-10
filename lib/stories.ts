export type Story = {
  id: number;
  createdAt?: number;
  title: string;
  subtitle: string;
  titleEn: string;
  subtitleEn: string;
  status: "Needs review" | "Approved" | "Ready" | "Published";
  duration: string;
  sources: number;
  progress: number;
  color: string;
  bodyUr?: string;
  bodyEn?: string;
  sourceUr?: string;
  sourceEn?: string;
  supportingUr?: string;
  supportingEn?: string;
  sourceSummaryUr?: string;
  sourceSummaryEn?: string;
};

export const validStatuses: Story["status"][] = ["Needs review", "Approved", "Ready", "Published"];
export const storyKey = (story: { titleEn: string }) => story.titleEn.trim().toLowerCase();

const earliestStoryTimestamp = Date.UTC(2020, 0, 1);

export function storyCreatedAt(story: Pick<Story, "id" | "createdAt">): number | null {
  if (Number.isSafeInteger(story.createdAt) && story.createdAt! >= earliestStoryTimestamp) return story.createdAt!;
  // Stories created before the explicit field was added used Date.now() IDs.
  return Number.isSafeInteger(story.id) && story.id >= earliestStoryTimestamp ? story.id : null;
}

export function storyAge(story: Pick<Story, "id" | "createdAt">, locale = "en", now = Date.now()) {
  const createdAt = storyCreatedAt(story);
  if (createdAt === null) return locale.startsWith("ur") ? "ابتدائی کہانی" : "Starter story";
  const elapsed = Math.max(0, now - createdAt);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 365 * 24 * 60 * 60 * 1000],
    ["month", 30 * 24 * 60 * 60 * 1000],
    ["week", 7 * 24 * 60 * 60 * 1000],
    ["day", 24 * 60 * 60 * 1000],
    ["hour", 60 * 60 * 1000],
    ["minute", 60 * 1000],
  ];
  const [unit, milliseconds] = units.find(([, size]) => elapsed >= size) ?? (["second", 1000] as [Intl.RelativeTimeFormatUnit, number]);
  const value = unit === "second" ? 0 : -Math.floor(elapsed / milliseconds);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(value, unit);
}

export function isStoredStory(value: unknown): value is Story {
  if (!value || typeof value !== "object") return false;
  const story = value as Story;
  return Number.isSafeInteger(story.id) && story.id > 0 && story.id < Number.MAX_SAFE_INTEGER
    && (story.createdAt === undefined || (Number.isSafeInteger(story.createdAt) && story.createdAt >= earliestStoryTimestamp))
    && [story.title, story.subtitle, story.titleEn, story.subtitleEn, story.duration, story.color]
      .every(text => typeof text === "string" && text.trim().length > 0 && text.length <= 10000)
    && [story.bodyUr, story.bodyEn].every(text => text === undefined || (typeof text === "string" && text.trim().length > 0 && text.length <= 50000))
    && ((story.bodyUr === undefined && story.bodyEn === undefined) || (story.bodyUr !== undefined && story.bodyEn !== undefined))
    && [story.sourceUr, story.sourceEn, story.supportingUr, story.supportingEn, story.sourceSummaryUr, story.sourceSummaryEn]
      .every(text => text === undefined || (typeof text === "string" && text.trim().length > 0 && text.length <= 5000))
    && validStatuses.includes(story.status)
    && Number.isSafeInteger(story.sources) && story.sources >= 0 && story.sources <= 10000
    && Number.isFinite(story.progress) && story.progress >= 0 && story.progress <= 100;
}

// Supports both historical browser formats without letting malformed storage
// prevent the shared queue from loading.
export function legacyStories(raw: string | null, defaults: Story[]): Story[] {
  if (!raw) return [];
  try {
    const saved: unknown = JSON.parse(raw);
    if (Array.isArray(saved)) return saved.filter(isStoredStory);
    if (saved && typeof saved === "object") {
      const statuses = saved as Record<string, unknown>;
      return defaults.flatMap(story => {
        const status = statuses[String(story.id)];
        if (!status || typeof status !== "object") return [];
        const restored = { ...story, ...status, id: story.id };
        return isStoredStory(restored) ? [restored] : [];
      });
    }
  } catch { /* A corrupt local backup must not block server reads. */ }
  return [];
}
