// Downloads: everything in every download client, finished or not, with what
// you can do to each. Lists come straight from the clients while the page is
// open and visible, every few seconds; the snapshot keeps only its summary.
// Pause and resume are a tap. Removing is a hold: once for the entry, or
// again from the other button for the entry and its files. Details opens a
// torrent: its files with Skip, Normal or High, its own speed limits, and
// its category.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectOne } from '../components/ConnectOne.tsx';
import { PAGE_SOURCES } from '../../shared/feeds.ts';
import type { DownloadClientId, DownloadEntry, DownloadList, DownloadState, EntryAction, FilePriority, TorrentDetail } from '../../shared/types.ts';
import { HoldButton } from '../components/Hold.tsx';
import { Empty, Meter } from '../components/ui.tsx';
import { type DownloadClient, PauseButton, useDownloadClients } from '../lib/downloads.tsx';
import { agoLong, breakable, eta, size, speed } from '../lib/format.ts';
import { msg, t as tr } from '../lib/i18n.ts';
import { call, useList } from '../lib/live-list.ts';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

const ACTION = { 'X-Patchboard': 'action' };
const EVERY_MS = 3000;

type Filter = 'all' | 'active' | 'seeding' | 'paused' | 'done' | 'errored';
const FILTERS: [Filter, string, DownloadState[]][] = [
  ['all', msg('All'), []],
  ['active', msg('Downloading'), ['downloading', 'stalled', 'queued', 'checking']],
  ['seeding', msg('Seeding'), ['seeding']],
  ['paused', msg('Paused'), ['paused']],
  ['done', msg('Finished'), ['done']],
  ['errored', msg('Failed'), ['errored']],
];
const ORDER: Record<DownloadState, number> = { errored: 0, downloading: 1, stalled: 2, checking: 3, queued: 4, paused: 5, seeding: 6, done: 7 };
const STATE: Record<DownloadState, string> = {
  downloading: msg('Downloading'),
  stalled: msg('Stalled'),
  queued: msg('Queued'),
  checking: msg('Checking'),
  paused: msg('Paused'),
  seeding: msg('Seeding'),
  done: msg('Finished'),
  errored: msg('Failed'),
};

type Row = DownloadEntry & { client: DownloadClient; kind: DownloadList['kind'] };

/** Each client's list, every few seconds while this tab is in view. */
function useLists(clients: DownloadClient[]): { lists: Map<DownloadClientId, DownloadList>; errors: Map<DownloadClientId, string>; reload: () => void } {
  const [lists, setLists] = useState(new Map<DownloadClientId, DownloadList>());
  const [errors, setErrors] = useState(new Map<DownloadClientId, string>());
  const ids = clients.map((c) => c.id).join(',');
  const tick = useRef<() => void>(() => {});
  useEffect(() => {
    if (!ids) return;
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(timer);
      const got = await Promise.all(
        ids.split(',').map(async (id) => {
          try {
            const res = await fetch(`/api/downloads/${id}/list`);
            const body = (await res.json()) as DownloadList & { error?: string };
            return [id, res.ok ? body : null, res.ok ? '' : (body.error ?? `HTTP ${res.status}`)] as const;
          } catch (err) {
            return [id, null, (err as Error).message] as const;
          }
        }),
      );
      if (gone) return;
      setLists((old) => {
        const next = new Map(old);
        for (const [id, list] of got) if (list) next.set(id as DownloadClientId, list);
        return next;
      });
      setErrors(new Map(got.filter(([, , e]) => e).map(([id, , e]) => [id as DownloadClientId, e])));
      if (document.visibilityState === 'visible') timer = setTimeout(() => void load(), EVERY_MS);
    };
    tick.current = () => void load();
    const onShow = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onShow);
    void load();
    return () => {
      gone = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [ids]);
  return { lists, errors, reload: () => tick.current() };
}

export function Downloads() {
  const { snap } = useStore();
  const ro = !!snap?.readOnly;
  const { clients, configured } = useDownloadClients();
  const { lists, errors, reload } = useLists(clients);
  const [filter, setFilter] = useUrlChoice<Filter>('show', FILTERS.map((f) => f[0]), 'all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  const rows: Row[] = useMemo(
    () =>
      clients
        .flatMap((c) => (lists.get(c.id)?.entries ?? []).map((e) => ({ ...e, client: c, kind: lists.get(c.id)!.kind })))
        .sort((a, b) => ORDER[a.state] - ORDER[b.state] || (b.added ?? 0) - (a.added ?? 0)),
    [clients, lists],
  );
  const counts = new Map(FILTERS.map(([f, , states]) => [f, f === 'all' ? rows.length : rows.filter((r) => states.includes(r.state)).length]));
  const needle = q.trim().toLowerCase();
  const states = FILTERS.find((f) => f[0] === filter)![2];
  const shown = rows.filter((r) => (!states.length || states.includes(r.state)) && (!needle || `${r.name} ${r.category ?? ''} ${r.tracker ?? ''}`.toLowerCase().includes(needle)));

  async function act(r: Row, action: EntryAction) {
    setBusy(`${r.client.id}:${r.id}`);
    setErr('');
    try {
      const res = await fetch(`/api/downloads/${r.client.id}/entries/${encodeURIComponent(r.id)}/${action}`, { method: 'POST', headers: ACTION });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      if (action === 'remove') setSaid(tr('Removed {name}. Its files stay.', { name: r.name }));
      if (action === 'delete') setSaid(tr('Removed {name} and its files.', { name: r.name }));
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  if (!configured)
    return (
      <div className="page downloads-page">
        <div className="page-head">
          <h1 className="page-title">{tr('Downloads')}</h1>
        </div>
        <Empty>
          {tr('No download client is set up.')} <ConnectOne sources={PAGE_SOURCES['/downloads']} />
        </Empty>
      </div>
    );

  const down = clients.reduce((n, c) => n + c.data.down, 0);
  const up = clients.reduce((n, c) => n + c.data.up, 0);
  return (
    <div className="page downloads-page">
      <div className="page-head">
        <h1 className="page-title">{tr('Downloads')}</h1>
        <p className="dlp-total">
          <Flow dir="down" label={tr('Downloading at')}>{speed(down)}</Flow>
          {up > 0 && <Flow dir="up" label={tr('Uploading at')}>{speed(up)}</Flow>}
        </p>
      </div>

      <ul className="dlp-clients" aria-label={tr('Download clients')}>
        {clients.map((c) => (
          <li key={c.id}>
            <strong>{c.container ? <Link to={`/c/${encodeURIComponent(c.container)}`}>{c.label}</Link> : c.label}</strong>
            <span className="dlp-client-state">
              {c.data.paused ? tr('Paused') : c.data.downloading ? tr('{n} downloading', { n: c.data.downloading }) : tr('Idle')}
              {c.data.altSpeed ? `, ${tr('speed limited')}` : ''}
            </span>
            {errors.get(c.id) && <span className="crit-text">{errors.get(c.id)}</span>}
            {!ro && (
              <span className="dlp-client-actions">
                {c.data.altSpeed !== undefined && <AltSpeed client={c} />}
                <PauseButton client={c} />
              </span>
            )}
          </li>
        ))}
      </ul>

      {!ro && <AddDownload clients={clients} onAdded={(name) => (setSaid(tr('Added {name}.', { name })), reload())} />}

      <div className="page-toolbar dlp-toolbar">
        <div className="seg" role="group" aria-label={tr('Show')}>
          {FILTERS.map(([f, label]) =>
            f === 'all' || counts.get(f) || filter === f ? (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {tr(label)} <span className="dlp-count">{counts.get(f)}</span>
              </button>
            ) : null,
          )}
        </div>
        <input className="field" type="search" placeholder={tr('Filter downloads')} aria-label={tr('Filter downloads')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {said && (
        <p className="req-done" role="status">
          {said}
        </p>
      )}
      {err && (
        <p className="crit-text" role="alert">
          {err}
        </p>
      )}

      {lists.size === 0 && errors.size === 0 ? (
        <div className="dlp-loading" aria-busy="true" />
      ) : shown.length === 0 ? (
        <Empty>{needle ? tr('Nothing matches.') : filter === 'all' ? tr('Nothing in any client.') : tr('Nothing here right now.')}</Empty>
      ) : (
        <ul className="dlp-list">
          {shown.map((r) => (
            <EntryRow key={`${r.client.id}:${r.id}`} r={r} many={clients.length > 1} ro={ro} busy={busy === `${r.client.id}:${r.id}`} onAct={(a) => void act(r, a)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EntryRow({ r, many, ro, busy, onAct }: { r: Row; many: boolean; ro: boolean; busy: boolean; onAct: (a: EntryAction) => void }) {
  const [open, setOpen] = useState(false);
  const unfinished = r.progress < 1 && !r.history;
  const canPause = !r.history && ['downloading', 'stalled', 'queued', 'seeding', 'checking'].includes(r.state);
  const canResume = !r.history && (r.state === 'paused' || (r.state === 'errored' && r.kind === 'torrent'));
  const level = r.state === 'errored' ? 'crit' : r.state === 'stalled' ? 'warn' : 'ok';
  // The one line that says how it's doing: speeds and time left while it runs, else its state.
  const torrent = r.kind === 'torrent';
  const uploaded = torrent ? (r.uploaded ?? (r.ratio !== undefined ? r.ratio * r.done : undefined)) : undefined;
  const how =
    r.state === 'downloading' ? (
      <>
        <Flow dir="down" label={tr('Downloading at')}>{speed(r.down)}</Flow>
        {r.up > 0 && <Flow dir="up" label={tr('Uploading at')}>{speed(r.up)}</Flow>}
        {eta(r.etaSec) && <span className="dlp-eta">{eta(r.etaSec)}</span>}
      </>
    ) : r.state === 'seeding' && r.up > 0 ? (
      <Flow dir="up" label={tr('Seeding at')}>{speed(r.up)}</Flow>
    ) : (
      tr(STATE[r.state])
    );
  return (
    <li className={`dlp-row is-${r.state}${r.kind === 'torrent' ? ' has-details' : ''}${open ? ' is-open' : ''}`}>
      <div className="dlp-head">
        <span className="dlp-name" title={r.name}>
          {breakable(r.name)}
        </span>
        <span className={`dlp-how ${r.state === 'errored' ? 'crit-text' : r.state === 'stalled' ? 'warn-text' : ''}`}>{how}</span>
      </div>
      {unfinished && <Meter value={r.progress * 100} level={level} label={tr('{name}, {pct}%', { name: r.name, pct: Math.round(r.progress * 100) })} />}
      <div className="dlp-foot">
      <div className="dlp-info">
      <div className="dlp-meta">
        {unfinished && <span className="dlp-pct">{Math.floor(r.progress * 100)}%</span>}
        <span>{unfinished && !torrent ? tr('{done} of {size}', { done: size(r.done), size: size(r.size) }) : size(r.size)}</span>
        {torrent && (
          <span className="dlp-flows">
            <Flow dir="down" label={tr('Downloaded')}>{size(r.done)}</Flow>
            {uploaded !== undefined && <Flow dir="up" label={tr('Uploaded')}>{size(uploaded)}</Flow>}
          </span>
        )}
        {r.ratio !== undefined && torrent && <Ratio value={r.ratio} judged={!unfinished} />}
        {r.category && <span className="dlp-tag">{r.category}</span>}
        {r.tracker && <span>{r.tracker}</span>}
        {many && <span>{r.client.label}</span>}
        {r.added && <span>{r.history ? tr('finished {when}', { when: agoLong(r.added) }) : tr('added {when}', { when: agoLong(r.added) })}</span>}
      </div>
      {r.error && <p className="dlp-error crit-text">{r.error}</p>}
      </div>
      {(r.kind === 'torrent' || !ro) && (
        <div className="dlp-actions">
          {r.kind === 'torrent' && (
            <button type="button" className="text-button dlp-details-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? tr('Hide details') : tr('Details')}
            </button>
          )}
          {!ro && (
          <>
          {canResume && (
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => onAct('resume')}>
              {tr('Resume')}
            </button>
          )}
          {canPause && !canResume && (
            <button type="button" className="button button-quiet" disabled={busy} onClick={() => onAct('pause')}>
              {tr('Pause')}
            </button>
          )}
          {r.history ? (
            <HoldButton className="text-button" label={tr('Remove {name} from the history', { name: r.name })} hint={tr('Hold to remove it from the history. The files stay.')} onConfirm={() => onAct('remove')}>
              {tr('Remove from history')}
            </HoldButton>
          ) : r.kind === 'usenet' ? (
            <HoldButton className="text-button" danger label={tr('Remove {name}', { name: r.name })} hint={tr('Hold to remove it, with what it has downloaded so far.')} onConfirm={() => onAct('remove')}>
              {tr('Remove')}
            </HoldButton>
          ) : (
            <>
              <HoldButton className="text-button" label={tr('Remove {name}', { name: r.name })} hint={tr('Hold to remove. The files stay.')} onConfirm={() => onAct('remove')}>
                {tr('Remove')}
              </HoldButton>
              <HoldButton className="text-button" danger label={tr('Remove {name} and delete its files', { name: r.name })} hint={tr('Hold to remove it and delete its files.')} onConfirm={() => onAct('delete')}>
                {tr('Remove and delete files')}
              </HoldButton>
            </>
          )}
          </>
          )}
        </div>
      )}
      </div>
      {open && <TorrentPanel r={r} ro={ro} />}
    </li>
  );
}

/** A speed or an amount with a small arrow: down is what came in, up is what went out. */
function Flow({ dir, label, children }: { dir: 'down' | 'up'; label: string; children: string }) {
  return (
    <span className={`dlp-flow is-${dir}`}>
      <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden>
        <path d={dir === 'down' ? 'M5 1.5v7M2 5.5l3 3 3-3' : 'M5 8.5v-7M2 4.5l3-3 3 3'} />
      </svg>
      <span className="sr-only">{label} </span>
      {children}
    </span>
  );
}

/**
 * Uploaded over downloaded. 1.00 gives back what it took: green from there,
 * amber on the way, red well short. Still downloading, it isn't judged yet.
 */
function Ratio({ value, judged }: { value: number; judged: boolean }) {
  const level = !judged ? '' : value >= 1 ? 'is-ok' : value >= 0.5 ? 'is-warn' : 'is-crit';
  return (
    <span className={`dlp-ratio ${level}`}>
      {tr('ratio {n}', { n: value.toFixed(2) })}
    </span>
  );
}

const PRIORITY: [FilePriority, string][] = [
  ['skip', msg('Skip')],
  ['normal', msg('Normal')],
  ['high', msg('High')],
];
const MB = 1_000_000;

/** One torrent opened up: category, its own speed limits, and each file with its priority. */
function TorrentPanel({ r, ro }: { r: Row; ro: boolean }) {
  const base = `/api/downloads/${r.client.id}/entries/${encodeURIComponent(r.id)}`;
  const { data, err, reload } = useList<TorrentDetail>(`${base}/detail`);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [fail, setFail] = useState('');
  const [down, setDown] = useState('');
  const [up, setUp] = useState('');
  const mbs = (b: number) => (b > 0 ? String(Math.round((b / MB) * 10) / 10) : '');
  useEffect(() => {
    if (!data) return;
    setDown(mbs(data.limits.down));
    setUp(mbs(data.limits.up));
  }, [data]);

  async function set(what: 'files' | 'category' | 'limits', body: object, done: string) {
    setBusy(true);
    setSaid('');
    setFail('');
    try {
      await call(`${base}/set/${what}`, { method: 'POST', headers: { ...ACTION, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setSaid(done);
      reload();
    } catch (e) {
      setFail((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (err) return <p className="crit-text dlp-panel">{err}</p>;
  if (!data) return <div className="dlp-panel dlp-loading" aria-busy="true" />;
  const bytes = (v: string) => Math.round((Number(v.replace(',', '.')) || 0) * MB);
  const changed = bytes(down) !== data.limits.down || bytes(up) !== data.limits.up;
  return (
    <div className="dlp-panel">
      <div className="dlp-settings">
        {data.categories && (
          <label className="dlp-setting">
            <span>{tr('Category')}</span>
            <select className="field" disabled={ro || busy} value={data.category ?? ''} onChange={(e) => void set('category', { category: e.target.value }, tr('Category set.'))}>
              <option value="">{tr('None')}</option>
              {data.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
        <form
          className="dlp-limits"
          onSubmit={(e) => {
            e.preventDefault();
            void set('limits', { limits: { down: bytes(down), up: bytes(up) } }, tr('Speed limits saved.'));
          }}
        >
          <label className="dlp-setting">
            <span>{tr('Download limit, MB/s')}</span>
            <input className="field" inputMode="decimal" placeholder={tr('None')} value={down} disabled={ro} onChange={(e) => setDown(e.target.value)} />
          </label>
          <label className="dlp-setting">
            <span>{tr('Upload limit, MB/s')}</span>
            <input className="field" inputMode="decimal" placeholder={tr('None')} value={up} disabled={ro} onChange={(e) => setUp(e.target.value)} />
          </label>
          {!ro && (
            <button type="submit" className="button button-quiet" disabled={busy || !changed}>
              {tr('Save')}
            </button>
          )}
        </form>
      </div>
      {said && (
        <p className="req-done" role="status">
          {said}
        </p>
      )}
      {fail && (
        <p className="crit-text" role="alert">
          {fail}
        </p>
      )}
      <div className="dlp-files-head">
        <span className="lib-total">{tr('{n} files', { n: data.files.length })}</span>
        {!ro && data.files.length > 1 && (
          <select
            className="field"
            aria-label={tr('Set every file to')}
            value=""
            disabled={busy}
            onChange={(e) => e.target.value && void set('files', { files: data.files.map((f) => f.index), priority: e.target.value }, tr('Every file set to {priority}.', { priority: tr(PRIORITY.find((p) => p[0] === e.target.value)![1]) }))}
          >
            <option value="">{tr('Set every file to…')}</option>
            {PRIORITY.map(([p, label]) => (
              <option key={p} value={p}>
                {tr(label)}
              </option>
            ))}
          </select>
        )}
      </div>
      <ul className="dlp-files">
        {data.files.map((f) => (
          <li key={f.index} className={f.priority === 'skip' ? 'is-skipped' : ''}>
            <div className="dlp-file">
              <span className="dlp-file-name">{breakable(f.name)}</span>
              <span className="lib-total">{f.progress < 1 && f.priority !== 'skip' ? tr('{pct}% of {size}', { pct: Math.floor(f.progress * 100), size: size(f.size) }) : size(f.size)}</span>
            </div>
            {ro ? (
              <span className="lib-total">{tr(PRIORITY.find((p) => p[0] === f.priority)![1])}</span>
            ) : (
              <select className="field" aria-label={tr('Priority of {name}', { name: f.name })} value={f.priority} disabled={busy} onChange={(e) => void set('files', { files: [f.index], priority: e.target.value }, tr('{name} set to {priority}.', { name: f.name, priority: tr(PRIORITY.find((p) => p[0] === e.target.value)![1]) }))}>
                {PRIORITY.map(([p, label]) => (
                  <option key={p} value={p}>
                    {tr(label)}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AltSpeed({ client }: { client: DownloadClient }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void fetch(`/api/downloads/${client.id}/altspeed`, { method: 'POST', headers: ACTION }).finally(() => setBusy(false));
      }}
    >
      {client.data.altSpeed ? tr('Full speed') : tr('Limit speed')}
    </button>
  );
}

/** Which clients take this: torrents to a torrent client, NZBs to a usenet one. */
function fits(c: DownloadClient, what: string): boolean {
  const usenet = c.data.kind === 'usenet';
  if (/^magnet:/i.test(what) || /\.torrent$/i.test(what)) return !usenet;
  if (/\.nzb(\?|$)/i.test(what)) return usenet;
  return true;
}

function AddDownload({ clients, onAdded }: { clients: DownloadClient[]; onAdded: (name: string) => void }) {
  const [link, setLink] = useState('');
  const [to, setTo] = useState<DownloadClientId | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const pick = (what: string) => clients.filter((c) => fits(c, what));
  const target = (what: string) => pick(what).find((c) => c.id === to) ?? pick(what)[0];
  const options = pick(link.trim());

  async function send(c: DownloadClient | undefined, body: object, name: string) {
    if (!c) return setErr(tr('No client here takes that.'));
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(`/api/downloads/${c.id}/add`, { method: 'POST', headers: { ...ACTION, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      setLink('');
      onAdded(name);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(f: File) {
    if (f.size > 10 * 1024 * 1024) return setErr(tr('Files can be up to 10 MB'));
    const data = btoa(Array.from(new Uint8Array(await f.arrayBuffer()), (b) => String.fromCharCode(b)).join(''));
    await send(target(f.name), { name: f.name, data }, f.name);
  }

  const linkName = (u: string) => decodeURIComponent((/[?&]dn=([^&]+)/.exec(u)?.[1] ?? '').replace(/\+/g, ' ')) || u.split('/').pop() || u;
  return (
    <form
      className="dlp-add"
      onSubmit={(e) => {
        e.preventDefault();
        const u = link.trim();
        if (u) void send(target(u), { url: u }, linkName(u));
      }}
    >
      <input className="field" value={link} onChange={(e) => setLink(e.target.value)} placeholder={tr('Magnet link or web address')} aria-label={tr('Magnet link or web address')} autoComplete="off" spellCheck={false} />
      {options.length > 1 && (
        <select className="field" aria-label={tr('Send to')} value={target(link.trim())?.id ?? ''} onChange={(e) => setTo(e.target.value as DownloadClientId)}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="button" disabled={busy || !link.trim()}>
        {busy ? tr('Adding') : tr('Add')}
      </button>
      <button type="button" className="button button-quiet" disabled={busy} onClick={() => file.current?.click()}>
        {tr('Add a file')}
      </button>
      <input ref={file} type="file" hidden accept=".torrent,.nzb,application/x-bittorrent,application/x-nzb" onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (f) void upload(f);
      }} />
      {err && (
        <span className="crit-text" role="alert">
          {err}
        </span>
      )}
    </form>
  );
}
