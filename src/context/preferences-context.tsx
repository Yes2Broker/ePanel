"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "@/context/session-context";

/** Display preferences, per user on this device. Kept in localStorage only. */
export interface Preferences {
  compactSidebar: boolean;
}

const DEFAULTS: Preferences = {
  compactSidebar: false,
};

const STORAGE_KEY = "y2b-preferences";

const PreferencesContext = createContext<{
  prefs: Preferences;
  update: (patch: Partial<Preferences>) => void;
} | undefined>(undefined);

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const userId = useSession().user?.id;
  const key = `${STORAGE_KEY}-${userId ?? "guest"}`;

  useEffect(() => {
    setPrefs(DEFAULTS);
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const saved = JSON.parse(raw);
        setPrefs({ ...DEFAULTS, compactSidebar: !!saved.compactSidebar });
      }
    } catch {
      // ignore unreadable storage
    }
  }, [key]);

  const update = (patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage blocked — preference lasts for this visit only
      }
      return next;
    });
  };

  return <PreferencesContext.Provider value={{ prefs, update }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
