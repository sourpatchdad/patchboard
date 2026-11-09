// Downloads: every unfinished download across the clients, and what Sonarr
// and Radarr are stuck on, each with what you can do about it. Pause and
// resume are a tap; removing a download (its files stay) and trying another
// release are a press and hold.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ArrData, ArrQueueItem, QueueItem } from '../../shared/types.ts';
import { HoldButton } from '../components/Hold.tsx';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { type DownloadClient, PauseButton, useDownloadClients } from '../lib/downloads.tsx';
import { eta, speed } from '../lib/format.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { useWidget } from './widget-context.ts';

const ACTION = { 'X-Patchboard': 'action' };

const STATUS: Record<QueueItem['state'], string> = { downloading: '', stalled: 'Stalled', queued: 'Queued', paused: 'Paused', errored: 'Error' };

/** Clients without per-item control still show their active downloads, read-only. */
function rowsOf(c: DownloadClient): { item: QueueItem; canAct: boolean }[] {
  if (c.data.items) return c.data.items.map((item) => ({ item, canAct: true }));
  return c.data.active.map((a) => ({ item: { id: a.name, name: a.name, progress: a.progress, speed: a.speed, etaSec: a.etaSec, state: a.speed ? 'downloading' : 'queued' }, canAct: false }));
}

export function DownloadsWidget() {
  const { snap } = useStore();
  const { clients, configured } = useDownloadClients();
  const sonarr = useSource<ArrData>('sonarr');
  const radarr = useSource<ArrData>('radarr');
  const { limit = 8 } = useWidget();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!configured && !sonarr.state && !radarr.state) return null;
  const ro = !!snap?.readOnly;

  async function act(key: string, url: string) {
    setBusy(key);
    setError('');
    try {
      const res = await fetch(url, { method: 'POST', headers: ACTION });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Only what Sonarr and Radarr are stuck on: the rest is already a download above.
  const stuck = (['sonarr', 'radarr'] as const).flatMap((app) =>
    ((app === 'sonarr' ? sonarr : radarr).data?.queue ?? []).filter((q) => q.state === 'warning' || q.state === 'failed').map((q) => ({ ...q, app })),
  );
  const rows = clients.flatMap((c) => rowsOf(c).map((r) => ({ ...r, c }))).slice(0, limit);
  const down = clients.reduce((n, c) => n + c.data.down, 0);

  return (
    <Section title="Downloads" count={down ? speed(down) : undefined} className="downloads">
      {clients.map((c) => (
        <p className="dl-client" key={c.id}>
          {c.container ? <Link to={`/c/${encodeURIComponent(c.container)}`}>{c.label}</Link> : c.label}
          <span className="dl-client-state">
            {c.data.paused ? 'Paused' : c.data.downloading ? `${c.data.downloading} downloading` : 'Idle'}
            {c.data.altSpeed ? ', speed limited' : ''}
          </span>
          <span className="dl-client-actions">
            {!ro && c.data.altSpeed !== undefined && (
              <button type="button" className="text-button" disabled={busy === `alt-${c.id}`} onClick={() => void act(`alt-${c.id}`, `/api/downloads/${c.id}/altspeed`)}>
                {c.data.altSpeed ? 'Full speed' : 'Limit speed'}
              </button>
            )}
            <PauseButton client={c} />
          </span>
        </p>
      ))}
      {rows.length === 0 && stuck.length === 0 ? (
        <Empty>Nothing downloading.</Empty>
      ) : (
        <ul className="dl-list">
          {rows.map(({ item, canAct, c }) => (
            <li key={`${c.id}:${item.id}`} className={`dl-row is-${item.state}`}>
              <span className="dl-name" title={item.name}>
                {item.name}
              </span>
              <span className="dl-status">{STATUS[item.state] || eta(item.etaSec) || speed(item.speed)}</span>
              {!ro && canAct && (
                <span className="dl-actions">
                  {item.state === 'paused' || item.state === 'errored' ? (
                    <button type="button" className="text-button" disabled={busy === item.id} onClick={() => void act(item.id, `/api/downloads/${c.id}/items/${encodeURIComponent(item.id)}/resume`)}>
                      Resume
                    </button>
                  ) : (
                    <button type="button" className="text-button" disabled={busy === item.id} onClick={() => void act(item.id, `/api/downloads/${c.id}/items/${encodeURIComponent(item.id)}/pause`)}>
                      Pause
                    </button>
                  )}
                  <HoldButton className="text-button" danger hint="Hold to remove. The files stay." onConfirm={() => void act(item.id, `/api/downloads/${c.id}/items/${encodeURIComponent(item.id)}/remove`)}>
                    Remove
                  </HoldButton>
                </span>
              )}
              <Meter value={item.progress * 100} level={item.state === 'errored' ? 'crit' : item.state === 'stalled' || item.state === 'paused' ? 'warn' : 'ok'} label={`${item.name}, ${Math.round(item.progress * 100)}%`} />
            </li>
          ))}
          {stuck.map((q: ArrQueueItem & { app: 'sonarr' | 'radarr' }) => (
            <li key={`${q.app}:${q.id}`} className={`dl-row is-${q.state}`}>
              <span className="dl-name" title={q.title}>
                {q.title}
              </span>
              <span className="dl-status">{q.app === 'sonarr' ? 'Sonarr' : 'Radarr'}</span>
              {!ro && (
                <span className="dl-actions">
                  <HoldButton className="text-button" hint="Hold to blocklist this release and search for another" onConfirm={() => void act(`${q.app}-${q.id}`, `/api/arr/${q.app}/retry/${q.id}`)}>
                    Try another release
                  </HoldButton>
                </span>
              )}
              <span className={`dl-why ${q.state === 'failed' ? 'crit-text' : 'warn-text'}`}>{q.message ?? (q.state === 'failed' ? 'Failed' : 'Needs a look')}</span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="crit-text">{error}</p>}
    </Section>
  );
}
