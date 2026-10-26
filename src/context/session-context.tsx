"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Employee, Permissions, SavedDashboard } from "@/types";
import { clearApiCache } from "@/lib/use-api";
import { api, ApiError, setSessionExpiredHandler, setSessionToken } from "@/lib/api";

interface SessionContextValue {
  user: Employee | null;
  permissions: Permissions | null;
  isManager: boolean;
  /** Saved dashboard layout (null = role default). Comes with the session, so no extra call. */
  dashboard: SavedDashboard | null;
  setDashboard: (d: SavedDashboard | null) => void;
  loading: boolean;
  login: (email: string, password: string) => Promise<Employee>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface StoredSession {
  token: string;
  employee: Employee;
  permissions: Permissions;
  dashboard?: SavedDashboard | null;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);
const STORAGE_KEY = "y2b-session";

function readStored(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.token ? parsed : null;
  } catch {
    return null;
  }
}

function writeStored(session: StoredSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked (private mode) — session just won't survive a refresh
  }
}

export function homePathFor(user: Employee) {
  return user.role === "Admin" || user.role === "HR" ? "/admin" : "/dashboard";
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loading, setLoading] = useState(true);

  const apply = useCallback((next: StoredSession | null) => {
    // A different (or no) user: nothing cached for the last one may show.
    if (!next || next.token !== readStored()?.token) clearApiCache();
    setSessionToken(next?.token ?? null);
    writeStored(next);
    setSession(next);
  }, []);

  // Restore the saved session, then confirm with the server that it's still
  // valid and pick up any profile/permission changes made by HR.
  useEffect(() => {
    setSessionExpiredHandler(() => apply(null));
    const stored = readStored();
    if (!stored) {
      setLoading(false);
      return;
    }
    apply(stored);
    setLoading(false);
    api.me()
      .then((me) => apply({ token: stored.token, ...me }))
      .catch(() => {
        // An expired session is cleared by the handler; network errors keep
        // the cached session so the panel still opens.
      });
    return () => setSessionExpiredHandler(null);
  }, [apply]);

  // The installed app can stay open for days: when it comes back to the screen
  // (at most hourly), re-check the session. That keeps the login alive (see
  // get_me) and picks up permission changes.
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60 * 60 * 1000) return;
      last = Date.now();
      api.me().then((me) => apply({ token, ...me })).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token, apply]);

  const login = async (email: string, password: string) => {
    const result = await api.login(email, password);
    if (!result) throw new ApiError("Incorrect email or password.");
    apply(result);
    return result.employee;
  };

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // the local sign-out below is what matters
    }
    apply(null);
  };

  const refresh = async () => {
    if (!session) return;
    const me = await api.me();
    apply({ token: session.token, ...me });
  };

  // Shown at once and kept in the stored session; the caller saves it to the database.
  const setDashboard = useCallback((dashboard: SavedDashboard | null) => {
    setSession((current) => {
      if (!current) return current;
      const next = { ...current, dashboard };
      writeStored(next);
      return next;
    });
  }, []);

  const user = session?.employee ?? null;

  return (
    <SessionContext.Provider
      value={{
        user,
        permissions: session?.permissions ?? null,
        isManager: user?.role === "Admin" || user?.role === "HR",
        dashboard: session?.dashboard ?? null,
        setDashboard,
        loading,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function useRequireSession() {
  const session = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!session.loading && !session.user) router.replace("/login");
  }, [session.loading, session.user, router]);
  return session;
}
