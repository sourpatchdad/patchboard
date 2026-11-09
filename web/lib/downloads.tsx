// Every configured download client behind one hook, plus the Pause/Resume
// button that works the same on all of them.

import { findContainer } from './services.ts';
import { useState } from 'react';
import type { DownloadClientId, QbitData } from '../../shared/types.ts';
import { useSource, useStore } from './store.tsx';

export interface DownloadClient {
  id: DownloadClientId;
  label: string;
  /** The container its app page lives under, when one runs here. */
  container?: string;
  data: QbitData;
}

export const CLIENTS: { id: DownloadClientId; label: string; container: string }[] = [
  { id: 'qbit', label: 'qBittorrent', container: 'qbittorrent' },
  { id: 'transmission', label: 'Transmission', container: 'transmission' },
  { id: 'deluge', label: 'Deluge', container: 'deluge' },
  { id: 'sabnzbd', label: 'SABnzbd', container: 'sabnzbd' },
  { id: 'nzbget', label: 'NZBGet', container: 'nzbget' },
];

export function useDownloadClients(): { clients: DownloadClient[]; configured: boolean } {
  const states = [useSource<QbitData>('qbit'), useSource<QbitData>('transmission'), useSource<QbitData>('deluge'), useSource<QbitData>('sabnzbd'), useSource<QbitData>('nzbget')];
  const snap = useStore().snap ?? null;
  const clients: DownloadClient[] = [];
  CLIENTS.forEach((c, i) => {
    const data = states[i].data;
    if (data) clients.push({ ...c, container: findContainer(snap, c.container, c.label), data });
  });
  return { clients, configured: states.some((s) => s.state) };
}

/** Pause or resume everything in one client. Hidden in read-only mode. */
export function PauseButton({ client }: { client: DownloadClient }) {
  const { snap } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (snap?.readOnly) return null;
  const action = client.data.paused ? 'resume' : 'pause';
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/downloads/${client.id}/${action}`, { method: 'POST', headers: { 'X-Patchboard': 'action' } });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button type="button" className="text-button now-action" disabled={busy} onClick={() => void go()} title={`${action === 'pause' ? 'Pause' : 'Resume'} every download in ${client.label}`} aria-label={`${action === 'pause' ? 'Pause' : 'Resume'} everything in ${client.label}`}>
        {busy ? (action === 'pause' ? 'Pausing' : 'Resuming') : action === 'pause' ? 'Pause' : 'Resume'}
      </button>
      {error && <span className="crit-text now-error">{error}</span>}
    </>
  );
}
