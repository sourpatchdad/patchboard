import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { setParked } from './services.ts';
import { useAppearance } from './appearance.ts';
import { EINK_MS, einkOn, setEink, useEink } from './eink.ts';
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
      return { ...prev, alerts: e.alerts, ...(e.ignored ? { ignored: e.ignored } : {}) };
    case 'changes':
      return { ...prev, changes: e.changes };
    case 'updates':
      return { ...prev, updates: e.updates };
    case 'catalog':
      return { ...prev, catalog: e.catalog };
    case 'pages':
      return { ...prev, pages: e.pages };
    case 'brand':
      return { ...prev, brand: e.brand };
    case 'boards':
      return { ...prev, boards: e.boards, boardSaved: e.changed ? { id: e.changed, at: Date.now() } : prev.boardSaved };
    case 'household':
      // Sent only to this device: what it should show now.
      if (prev.household?.id !== e.id) return prev;
      {
        const { type: _type, id: _id, ...view } = e;
        return { ...prev, household: { id: prev.household.id, name: prev.household.name, lights: prev.household.lights, ...view } };
      }
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
          setParked(s.alerts);
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
    const take = (events: ServerEvent[]) =>
      setSnap((prev) => {
        const next = prev ? events.reduce(apply, prev) : prev;
        if (next) setParked(next.alerts);
        return next;
      });
    // An e-ink screen flashes on every redraw: what changes is gathered and
    // drawn once a minute. Its own settings still apply at once.
    let held: ServerEvent[] = [];
    const flush = setInterval(() => {
      if (held.length) take(held.splice(0));
    }, EINK_MS);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data as string) as ServerEvent;
      if (einkOn() && e.type !== 'household') held.push(e);
      else take([...held.splice(0), e]);
    };

    void load();
    return () => {
      closed = true;
      clearInterval(flush);
      es.close();
    };
  }, []);

  // E-ink, from this device's household settings or its own Look.
  const look = useAppearance();
  const screen = snap?.household?.screen;
  useEffect(() => setEink(!!screen || look.eink, screen === 'eink-color' || (!screen && look.eink && look.einkColor)), [screen, look.eink, look.einkColor]);

  return <Ctx.Provider value={{ snap, live, failed, auth }}>{children}</Ctx.Provider>;
}

/**
 * A preview's own view of the snapshot: these sources in place of what the
 * server sends. The widget gallery uses it to show a widget with sample data
 * before its app is connected; nothing outside the preview sees them.
 */
export function WithSources({ sources, children }: { sources: Partial<Snapshot['sources']> | null | undefined; children: ReactNode }) {
  const store = useContext(Ctx);
  if (!store.snap || !sources || !Object.keys(sources).length) return <>{children}</>;
  return <Ctx.Provider value={{ ...store, snap: { ...store.snap, sources: { ...store.snap.sources, ...sources } } }}>{children}</Ctx.Provider>;
}

/** Settings, Alerts thresholds, with the defaults until the snapshot arrives. */
export function useLimits(): import('../../shared/types.ts').Limits {
  const { snap } = useStore();
  return snap?.limits ?? { poolWarnPct: 85, poolCritPct: 95, diskWarnC: 50, diskCritC: 58 };
}

/** A meter's color for a fill percentage against the storage thresholds. */
export const storageLevel = (pct: number, l: import('../../shared/types.ts').Limits): 'ok' | 'warn' | 'crit' => (pct >= l.poolCritPct ? 'crit' : pct >= l.poolWarnPct ? 'warn' : 'ok');

export function useStore(): Store {
  return useContext(Ctx);
}

export function useSource<T>(id: SourceId): { state: SourceState<T> | undefined; data: T | null } {
  const { snap } = useContext(Ctx);
  const state = snap?.sources[id] as SourceState<T> | undefined;
  return { state, data: state?.data ?? null };
}

/** Re-render on an interval so relative times stay current. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(Date.now());
  // An e-ink screen ticks once a minute at most.
  const every = useEink() ? Math.max(intervalMs, EINK_MS) : intervalMs;
  useEffect(() => {
    // A wall page swiped back into view (React's Activity pauses hidden pages)
    // starts from the time now, not the time it was hidden.
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}
