"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { initialStories } from "../lib/story-defaults";
import { importBrowserStories, storyRequest } from "../lib/story-client";
import type { Story } from "../lib/stories";

export function useStories() {
  const [stories, setStories] = useState(initialStories);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(false);
  const migration = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (writing.current) return;
    const version = ++requestVersion.current;
    try {
      migration.current ??= importBrowserStories().catch(cause => { migration.current = null; throw cause; });
      await migration.current;
      const result = await storyRequest();
      if (!mounted.current || version !== requestVersion.current) return;
      setStories(result.stories);
      setLoaded(true);
      setError("");
    } catch (cause) {
      if (mounted.current && version === requestVersion.current) {
        setError(cause instanceof Error ? cause.message : "Stories could not be loaded. Please retry.");
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const versions = requestVersion;
    queueMicrotask(() => { if (mounted.current) void refresh(); });
    const refreshVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", refreshVisible);
    window.addEventListener("pageshow", refreshVisible);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const interval = window.setInterval(refreshVisible, 30000);
    return () => {
      mounted.current = false;
      versions.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      window.removeEventListener("pageshow", refreshVisible);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [refresh]);

  const save = useCallback(async (method: "POST" | "PATCH", payload: unknown) => {
    if (!loaded || writing.current) throw new Error("Wait for stories to finish syncing, then retry.");
    writing.current = true;
    ++requestVersion.current; // Discard a stale read that finishes after this save.
    setSaving(true);
    try {
      const result = await storyRequest({ method, body: JSON.stringify(payload) });
      if (mounted.current) { setStories(result.stories); setError(""); }
      return result;
    } catch (cause) {
      if (mounted.current) setError("Your last change was not confirmed. Refresh the queue and retry if it is missing.");
      throw cause;
    } finally {
      writing.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [loaded]);

  const create = (story: Story) => save("POST", { story });
  const updateStatus = (id: number, status: Story["status"], progress = 100) => save("PATCH", { id, status, progress });
  return { stories, loaded, saving, error, refresh, create, updateStatus };
}
