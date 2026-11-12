// A widget's own data from the server, by board and widget id.

import { useEffect, useState } from 'react';

/** A widget's server-side data, refetched every few minutes. */
export function useWidgetData<T>(path: string, ms: number): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch(path)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject()))
        .then((d) => !gone && (setData(d), setFailed(false)))
        .catch(() => !gone && setFailed(true));
    void load();
    const t = setInterval(load, ms);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, [path, ms]);
  return { data, failed };
}
