"use client";

import { useCallback, useEffect, useState } from "react";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
  subscriptionStatus: "active" | "trialing" | "past_due" | "canceled";
  subscriptionEndsAt: number | null;
  createdAt: number;
};

export function useSession(initialUser?: SessionUser | null) {
  const [user, setUser] = useState<SessionUser | null>(initialUser ?? null);
  const [loading, setLoading] = useState(initialUser === undefined);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      const result = await response.json() as { user?: SessionUser };
      setUser(response.ok && result.user ? result.user : null);
    } catch { setUser(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (initialUser === undefined) queueMicrotask(() => void refresh()); }, [initialUser, refresh]);
  return { user, loading, refresh };
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.href = "/";
}
