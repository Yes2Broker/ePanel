"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

/** Per-device display preferences. Kept in localStorage only. */
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        setPrefs({ ...DEFAULTS, compactSidebar: !!saved.compactSidebar });
      }
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const update = (patch: Partial<Preferences>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
