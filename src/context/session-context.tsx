"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Employee } from "@/types";
import { employees } from "@/data/employees";

interface SessionContextValue {
  user: Employee | null;
  loading: boolean;
  login: (email: string) => Employee | null;
  loginAs: (employee: Employee) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);
const STORAGE_KEY = "y2b-mock-session";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = employees.find((e) => e.id === stored);
      if (found) setUser(found);
    }
    setLoading(false);
  }, []);

  const loginAs = (employee: Employee) => {
    window.localStorage.setItem(STORAGE_KEY, employee.id);
    setUser(employee);
  };

  // Mock authentication: matches by email only, ignores password.
  const login = (email: string) => {
    const match = employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
    if (match) loginAs(match);
    return match ?? null;
  };

  const logout = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  return (
    <SessionContext.Provider value={{ user, loading, login, loginAs, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Convenience redirect hook for pages that require a logged-in user. */
export function useRequireSession() {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  return { user, loading };
}
