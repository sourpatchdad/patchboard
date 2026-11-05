import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { ServerEvent, Snapshot, SourceId, SourceState } from '../../shared/types.ts';

interface Store {
  snap: Snapshot | null;
  live: boolean;
  failed: boolean;
  /** The server answered 401: sign-in needed, and how. */
  auth: 'password' | 'forward' | 'oidc' | null;
}

const Ctx = createContext<Store>({ snap: null, live: false, failed: false, auth: null });

function apply(prev: Snapshot, e: ServerEvent): Snapshot {
  switch (e.type) {
    case 'source':
      return { ...prev, sources: { ...prev.sources, [e.state.id]: e.state } };
    case 'sources':
      return { ...prev, sources: e.sources };
    case 'alerts':
      return { ...prev, alerts: e.alerts };
    case 'changes':
      return { ...prev, changes: e.changes };
    case 'updates':
      return { ...prev, updates: e.updates };
    case 'catalog':
      return { ...prev, catalog: e.catalog };
    case 'pages':
      return { ...prev, pages: e.pages };
  }
}

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [auth, setAuth] = useState<Store['auth']>(null);

  useEffect(() => {
    let closed = false;
    const load = async () => {
      try {
        const res = await fetch('/api/snapshot');
        if (res.status === 401) {
          const body = (await res.json().catch(() => ({}))) as { auth?: 'password' | 'forward' | 'oidc' };
          if (!closed) setAuth(body.auth ?? 'password');
          return;
        }
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

  return <Ctx.Provider value={{ snap, live, failed, auth }}>{children}</Ctx.Provider>;
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
