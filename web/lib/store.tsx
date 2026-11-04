import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { ServerEvent, Snapshot, SourceId, SourceState } from '../../shared/types.ts';

interface Store {
  snap: Snapshot | null;
  live: boolean;
  failed: boolean;
}

const Ctx = createContext<Store>({ snap: null, live: false, failed: false });

function apply(prev: Snapshot, e: ServerEvent): Snapshot {
  switch (e.type) {
    case 'source':
      return { ...prev, sources: { ...prev.sources, [e.state.id]: e.state } };
    case 'alerts':
      return { ...prev, alerts: e.alerts };
    case 'changes':
      return { ...prev, changes: e.changes };
    case 'updates':
      return { ...prev, updates: e.updates };
    case 'catalog':
      return { ...prev, catalog: e.catalog };
  }
}

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let closed = false;
    const load = async () => {
      try {
        const res = await fetch('/api/snapshot');
        if (!res.ok) throw new Error(String(res.status));
        const s = (await res.json()) as Snapshot;
        if (!closed) {
          setSnap(s);
          setFailed(false);
        }
      } catch {
        if (!closed) setFailed(true);
      }
    };

    const es = new EventSource('/api/events');
    // Resync on every (re)connect so nothing missed while offline lingers.
    es.onopen = () => {
      setLive(true);
      void load();
    };
    es.onerror = () => setLive(false);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data as string) as ServerEvent;
      setSnap((prev) => (prev ? apply(prev, e) : prev));
    };

    void load();
    return () => {
      closed = true;
      es.close();
    };
  }, []);

  return <Ctx.Provider value={{ snap, live, failed }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  return useContext(Ctx);
}

export function useSource<T>(id: SourceId): { state: SourceState<T> | undefined; data: T | null } {
  const { snap } = useContext(Ctx);
  const state = snap?.sources[id] as SourceState<T> | undefined;
  return { state, data: state?.data ?? null };
}

/** Re-render on an interval so relative times stay honest. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
