"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, type Role } from "./http";

type Query = Record<string, string | number | boolean | null | undefined>;

// Small data-fetching hook: loading / error / reload, optional polling, and a stable
// request key so filters changing re-fetches automatically.
export function useApi<T>(
  role: Role,
  path: string | null,
  query?: Query,
  opts: { poll?: number; enabled?: boolean } = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = path ? path + JSON.stringify(query ?? {}) : "";
  const seq = useRef(0);
  const enabled = opts.enabled !== false && !!path;

  const load = useCallback(
    async (silent = false) => {
      if (!enabled || !path) return;
      const my = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api<T>(role, path, { query });
        if (my === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (my === seq.current) setError(e instanceof ApiError ? e.message : "Something went wrong.");
      } finally {
        if (my === seq.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [role, key, enabled],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!opts.poll || !enabled) return;
    const id = setInterval(() => load(true), opts.poll);
    return () => clearInterval(id);
  }, [opts.poll, enabled, load]);

  return { data, error, loading, reload: () => load(), setData };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set] as const;
}
