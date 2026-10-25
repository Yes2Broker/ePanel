"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";

// Results by call (the fetcher's code + its deps), kept for this tab until
// logout. Pages show the cached result at once and refresh it in the
// background. (Identical requests made at the same moment are shared in api.ts.)
const cache = new Map<string, unknown>();

/** Forget every cached result (on login / logout). */
export function clearApiCache() {
  cache.clear();
}

/**
 * Loads data from an api.* call and re-loads when `deps` change.
 * `reload()` refetches without clearing what's on screen.
 */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const key = fetcher.toString() + JSON.stringify(deps);
  const [data, setData] = useState<T | null>(() => (cache.get(key) as T | undefined) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    if (cache.has(key)) setData(cache.get(key) as T);
    setLoading(true);
    try {
      const result = await fetcher();
      cache.set(key, result);
      if (id === latest.current) {
        setData(result);
        setError("");
      }
    } catch (err) {
      if (id === latest.current) setError(errorMessage(err));
    } finally {
      if (id === latest.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    load();
  }, [load]);

  // Local edits (setData) update the cache too, so they survive navigation.
  const set = useCallback((v: T | null | ((prev: T | null) => T | null)) => {
    setData((prev) => {
      const next = typeof v === "function" ? (v as (p: T | null) => T | null)(prev) : v;
      if (next == null) cache.delete(key); else cache.set(key, next);
      return next;
    });
  }, [key]);

  return { data, setData: set, loading, error, reload: load };
}
