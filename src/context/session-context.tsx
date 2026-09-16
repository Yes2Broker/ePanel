"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Employee } from "@/types";
import { supabase } from "@/lib/supabase";
import { mapEmployeeRow } from "@/lib/employee-mapper";

interface SessionContextValue {
  user: Employee | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Employee | null>;
  loginAs: (employee: Employee) => void;
  logout: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);
const STORAGE_KEY = "y2b-session";

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const loginAs = (employee: Employee) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(employee));
    setUser(employee);
  };

  // Real login: calls the login_employee() Postgres function.
  // Passwords are checked inside Supabase and never leave it.
  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.rpc("login_employee", {
      p_email: email,
      p_password: password,
    });

    if (error) {
      console.error("Login error:", error.message);
      return null;
    }
    if (!data || data.length === 0) return null;

    const employee = mapEmployeeRow(data[0]);
    loginAs(employee);
    return employee;
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

export function useRequireSession() {
  const { user, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  return { user, loading };
}
