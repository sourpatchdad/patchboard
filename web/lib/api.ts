import { useEffect, useState } from 'react';
import type { Series } from '../../shared/types.ts';

/**
 * GET a JSON endpoint, optionally refreshing on an interval. Keeps the last
 * good data through a failed refresh, the same way the hub does.
 */
export function useJson<T>(url: string | null, refreshMs?: number): { data: T | null; error: string | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        setData(body as T);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = refreshMs ? setInterval(load, refreshMs) : undefined;
    return () => {
      cancelled = true;
      if (t) clearInterval(t);
    };
  }, [url, refreshMs]);

  return { data, error, loading };
}

/** Recorded time series from SQLite, e.g. useHistory(['cpu', 'mem.used']). */
export function useHistory(keys: string[], hours = 24, points = 240, refreshMs = 60_000): Record<string, Series> {
  const qs = keys.map((k) => `key=${encodeURIComponent(k)}`).join('&');
  const { data } = useJson<Record<string, Series>>(keys.length ? `/api/history?${qs}&hours=${hours}&points=${points}` : null, refreshMs);
  return data ?? {};
}
