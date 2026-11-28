// Library: Sonarr's shows and Radarr's films in one place. Every title with
// what's on disk, what's missing, the whole queue, and adding something new.
// A show opens to its seasons and episodes. History is what Sonarr or
// Radarr did lately. With Bazarr, the subtitles still missing; with
// Prowlarr, the indexers.
// Lists come straight from the app while the page is open; the queue
// refreshes every few seconds while it's in view.

import { useEffect, useState } from 'react';
import { ConnectOne } from '../components/ConnectOne.tsx';
import { PAGE_SOURCES } from '../../shared/feeds.ts';
import type { ArrApp, ArrOptions, ArrQueueItem, EpisodeInfo, FoundItem, HistoryEvent, HistoryItem, Indexer, IndexerList, IndexerTest, LibraryItem, SubtitleItem, SubtitleKind, ShowDetail, SubtitleLang, SubtitleList, WantedList } from '../../shared/types.ts';
import { HoldButton } from '../components/Hold.tsx';
import { Empty, Meter, PosterRow as Row } from '../components/ui.tsx';
import { agoLong, breakable, clock, size } from '../lib/format.ts';
import { msg, t as tr } from '../lib/i18n.ts';
import { ACTION, call, useList } from '../lib/live-list.ts';
import { locale } from '../lib/region.ts';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

const QUEUE_EVERY_MS = 5000;
const PAGE = 60;

type View = 'items' | 'wanted' | 'queue' | 'history' | 'subtitles' | 'indexers' | 'add';
const VIEWS: [View, string][] = [
  ['items', msg('Library')],
  ['wanted', msg('Missing')],
  ['queue', msg('Queue')],
  ['history', msg('History')],
  ['subtitles', msg('Subtitles')],
  ['indexers', msg('Indexers')],
  ['add', msg('Add')],
];
const APPS: [ArrApp, string][] = [
  ['sonarr', msg('Shows')],
  ['radarr', msg('Films')],
];
const QUEUE_STATE: Record<ArrQueueItem['state'], string> = {
  downloading: msg('Downloading'),
  queued: msg('Queued'),
  paused: msg('Paused'),
  importing: msg('Importing'),
  warning: msg('Needs a look'),
  failed: msg('Failed'),
};

export function Library() {
  const { snap } = useStore();
  const ro = !!snap?.readOnly;
  const apps = APPS.filter(([a]) => snap?.sources[a]).map(([a]) => a);
  const [app, setApp] = useUrlChoice<ArrApp>('app', APPS.map((a) => a[0]), apps[0] ?? 'sonarr');
  const [view, setView] = useUrlChoice<View>('view', VIEWS.map((v) => v[0]), 'items');
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');
  const on = apps.includes(app) ? app : apps[0];

  useEffect(() => {
    setSaid('');
    setErr('');
  }, [on, view]);

  if (!snap) return <div className="page library-page" aria-busy="true" />;
  if (!on)
    return (
      <div className="page library-page">
        <div className="page-head">
          <h1 className="page-title">{tr('Library')}</h1>
        </div>
        <Empty>
          {tr('Sonarr and Radarr are not set up.')} <ConnectOne sources={PAGE_SOURCES['/library']} />
        </Empty>
      </div>
    );

  const queueCount = (snap.sources[on]?.data as { queueTotal?: number } | null)?.queueTotal ?? 0;
  const shows = on === 'sonarr';

  /** POST an action, then say so or show why not. */
  async function act(path: string, done: string, body?: object, after?: () => void) {
    setErr('');
    setSaid('');
    try {
      await call(`/api/library/${on}/${path}`, { method: 'POST', headers: ACTION, body: JSON.stringify(body ?? {}) });
      setSaid(done);
      after?.();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="page library-page">
      <div className="page-head">
        <h1 className="page-title">{tr('Library')}</h1>
      </div>

      <div className="page-toolbar">
        <div className="seg lib-views" role="group" aria-label={tr('Show')}>
          {VIEWS.filter(([v]) => !(ro && v === 'add') && (v !== 'subtitles' || snap.sources.bazarr) && (v !== 'indexers' || snap.sources.prowlarr)).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {tr(label)}
              {v === 'queue' && queueCount > 0 && <span className="dlp-count">{queueCount}</span>}
            </button>
          ))}
        </div>
        {apps.length > 1 && view !== 'indexers' && (
          <div className="seg" role="group" aria-label={tr('Shows or films')}>
            {APPS.map(([a, label]) => (
              <button key={a} type="button" aria-pressed={on === a} onClick={() => setApp(a)}>
                {tr(label)}
              </button>
            ))}
          </div>
        )}
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

      {view === 'items' && <Items app={on} shows={shows} ro={ro} act={act} />}
      {view === 'wanted' && <Wanted app={on} shows={shows} ro={ro} act={act} />}
      {view === 'queue' && <Queue app={on} ro={ro} act={act} />}
      {view === 'history' && <History app={on} />}
      {view === 'subtitles' && snap.sources.bazarr && <Subtitles kind={shows ? 'episodes' : 'movies'} ro={ro} onSaid={setSaid} onErr={setErr} />}
      {view === 'indexers' && snap.sources.prowlarr && <Indexers ro={ro} onSaid={setSaid} onErr={setErr} />}
      {view === 'add' && !ro && <Add app={on} shows={shows} onAdded={(title) => setSaid(tr('Added {title}.', { title }))} />}
    </div>
  );
}

type Act = (path: string, done: string, body?: object, after?: () => void) => Promise<void>;

function Items({ app, shows, ro, act }: { app: ArrApp; shows: boolean; ro: boolean; act: Act }) {
  const { data, err, reload } = useList<LibraryItem[]>(`/api/library/${app}/items`);
  const [opened, setOpened] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [more, setMore] = useState(PAGE);
  const needle = q.trim().toLowerCase();
  const all = [...(data ?? [])].sort((a, b) => a.title.replace(/^(the|a|an)\s+/i, '').localeCompare(b.title.replace(/^(the|a|an)\s+/i, '')));
  const shown = all.filter((i) => !needle || `${i.title} ${i.year ?? ''} ${i.by ?? ''}`.toLowerCase().includes(needle));
  const onDisk = (i: LibraryItem) =>
    shows
      ? i.total
        ? tr('{have} of {total} episodes', { have: i.have, total: i.total })
        : tr('No episodes yet')
      : i.have
        ? tr('On disk')
        : i.status === 'upcoming'
          ? tr('Not out yet')
          : tr('Missing');
  const status: Record<LibraryItem['status'], string> = { airing: tr('Airing'), ended: tr('Ended'), upcoming: tr('Not started'), out: '' };

  return (
    <>
      <div className="lib-filter">
        <input className="field" type="search" placeholder={shows ? tr('Filter shows') : tr('Filter films')} aria-label={shows ? tr('Filter shows') : tr('Filter films')} value={q} onChange={(e) => (setQ(e.target.value), setMore(PAGE))} />
        {data && <span className="lib-total">{shows ? tr('{n} shows', { n: all.length }) : tr('{n} films', { n: all.length })}</span>}
      </div>
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : shown.length === 0 ? (
        <Empty>{needle ? tr('Nothing matches.') : shows ? tr('No shows yet.') : tr('No films yet.')}</Empty>
      ) : (
        <>
          <ul className="lib-list">
            {shown.slice(0, more).map((i) => {
              const short = i.have < i.total && i.status !== 'upcoming';
              return (
                <Row
                  key={i.id}
                  art={i.art}
                  title={i.title}
                  below={shows && opened === i.id && <ShowPanel app={app} id={i.id} title={i.title} ro={ro} act={act} />}
                  actions={
                    !ro && (
                      <>
                        <button type="button" className="button button-quiet" aria-pressed={i.monitored} onClick={() => void act(`items/${i.id}/monitor`, i.monitored ? tr('Stopped watching for {title}.', { title: i.title }) : tr('Watching for {title}.', { title: i.title }), { on: !i.monitored }, reload)}>
                          {i.monitored ? tr('Monitored') : tr('Not monitored')}
                        </button>
                        <button type="button" className="button button-quiet" onClick={() => void act(`items/${i.id}/search`, tr('Searching for {title}.', { title: i.title }))}>
                          {tr('Search')}
                        </button>
                      </>
                    )
                  }
                >
                  <a className="lib-title" href={i.url} target="_blank" rel="noreferrer">
                    {i.title}
                    {i.year ? <span className="lib-year"> {i.year}</span> : null}
                  </a>
                  <div className="dlp-meta">
                    <span className={short && i.monitored ? 'warn-text' : undefined}>{onDisk(i)}</span>
                    {i.size > 0 && <span>{size(i.size)}</span>}
                    {status[i.status] && <span>{status[i.status]}</span>}
                    {i.by && <span>{i.by}</span>}
                  </div>
                  {shows && (
                    <button type="button" className="text-button lib-open" aria-expanded={opened === i.id} onClick={() => setOpened(opened === i.id ? null : i.id)}>
                      {opened === i.id ? tr('Hide seasons') : tr('Seasons and episodes')}
                    </button>
                  )}
                </Row>
              );
            })}
          </ul>
          {shown.length > more && (
            <button type="button" className="button button-quiet lib-more" onClick={() => setMore((m) => m + PAGE)}>
              {tr('Show {n} more', { n: Math.min(PAGE, shown.length - more) })}
            </button>
          )}
        </>
      )}
    </>
  );
}

function Wanted({ app, shows, ro, act }: { app: ArrApp; shows: boolean; ro: boolean; act: Act }) {
  const { data, err } = useList<WantedList>(`/api/library/${app}/wanted`);
  return (
    <>
      {data && data.total > 0 && (
        <div className="lib-filter">
          <span className="lib-total">
            {shows ? tr('{n} episodes missing', { n: data.total }) : tr('{n} films missing', { n: data.total })}
            {data.total > data.items.length ? `, ${tr('newest {n} here', { n: data.items.length })}` : ''}
          </span>
          {!ro && (
            <button type="button" className="button" onClick={() => void act('search-all', shows ? tr('Searching for every missing episode.') : tr('Searching for every missing film.'))}>
              {tr('Search for all')}
            </button>
          )}
        </div>
      )}
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : data.items.length === 0 ? (
        <Empty>{shows ? tr('Every monitored episode is on disk.') : tr('Every monitored film is on disk.')}</Empty>
      ) : (
        <ul className="lib-list">
          {data.items.map((w) => (
            <Row
              key={w.id}
              art={w.art}
              title={w.title}
              actions={
                !ro && (
                  <button type="button" className="button button-quiet" onClick={() => void act(`wanted/${w.id}/search`, tr('Searching for {title}.', { title: `${w.title} ${w.subtitle ?? ''}`.trim() }))}>
                    {tr('Search')}
                  </button>
                )
              }
            >
              <span className="lib-title">
                {w.title}
                {w.subtitle && <span className="lib-year"> {w.subtitle}</span>}
              </span>
              {w.when && <div className="dlp-meta">{shows ? tr('aired {when}', { when: agoLong(w.when) }) : tr('out {when}', { when: agoLong(w.when) })}</div>}
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

const code = (s: number, e: number) => `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`;
const day = (t: number) => new Date(t).toLocaleDateString(locale(), { month: 'short', day: 'numeric', ...(new Date(t).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });

/** A show opened up: each season with Monitor and Search, and its episodes a tap away. */
function ShowPanel({ app, id, title, ro, act }: { app: ArrApp; id: number; title: string; ro: boolean; act: Act }) {
  const { data, err, reload } = useList<ShowDetail>(`/api/library/${app}/items/${id}/show`);
  const [season, setSeason] = useState<number | null>(null);
  const now = Date.now();
  if (err) return <p className="crit-text lib-panel">{err}</p>;
  if (!data) return <div className="lib-panel dlp-loading" aria-busy="true" />;
  // The newest season with episodes on the way or missing opens first.
  const shown = season ?? data.seasons.find((s) => s.number > 0)?.number ?? null;
  return (
    <div className="lib-panel">
      <ul className="lib-seasons">
        {data.seasons.map((s) => {
          const name = s.number === 0 ? tr('Specials') : tr('Season {n}', { n: s.number });
          const short = s.monitored && s.have < s.aired;
          const eps = data.episodes.filter((e) => e.season === s.number);
          return (
            <li key={s.number}>
              <div className="lib-season">
                <button type="button" className="text-button lib-season-name" aria-expanded={shown === s.number} onClick={() => setSeason(shown === s.number ? -1 : s.number)}>
                  {name}
                </button>
                <span className={`lib-total ${short ? 'warn-text' : ''}`}>{s.aired ? tr('{have} of {total} episodes', { have: s.have, total: s.aired }) : tr('No episodes yet')}</span>
                {s.size > 0 && <span className="lib-total">{size(s.size)}</span>}
                {!ro && (
                  <span className="lib-season-actions">
                    <button type="button" className="button button-quiet" aria-pressed={s.monitored} onClick={() => void act(`items/${id}/season/${s.number}/monitor`, s.monitored ? tr('Stopped watching for {title}.', { title: `${title}, ${name}` }) : tr('Watching for {title}.', { title: `${title}, ${name}` }), { on: !s.monitored }, reload)}>
                      {s.monitored ? tr('Monitored') : tr('Not monitored')}
                    </button>
                    {s.have < s.aired && (
                      <button type="button" className="button button-quiet" onClick={() => void act(`items/${id}/season/${s.number}/search`, tr('Searching for {title}.', { title: `${title}, ${name}` }))}>
                        {tr('Search')}
                      </button>
                    )}
                  </span>
                )}
              </div>
              {shown === s.number && (
                <ul className="lib-episodes">
                  {eps.map((e) => (
                    <EpisodeRow key={e.id} e={e} now={now} show={title} ro={ro} act={act} />
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EpisodeRow({ e, now, show, ro, act }: { e: EpisodeInfo; now: number; show: string; ro: boolean; act: Act }) {
  const aired = e.airs !== undefined && e.airs <= now;
  const missing = aired && !e.hasFile;
  return (
    <li className={e.hasFile ? '' : aired ? 'is-missing' : 'is-ahead'}>
      <span className="lib-ep-code">{code(e.season, e.number)}</span>
      <span className="lib-ep-title">{e.title || tr('Untitled')}</span>
      <span className="lib-total lib-ep-date">{e.airs ? (aired ? day(e.airs) : tr('airs {when}', { when: day(e.airs) })) : tr('No date yet')}</span>
      <span className={`lib-total lib-ep-state ${missing && e.monitored ? 'warn-text' : ''}`}>{e.hasFile ? tr('On disk') : aired ? tr('Missing') : ''}</span>
      {!ro && missing && (
        <button type="button" className="text-button lib-ep-act" onClick={() => void act(`episodes/${e.id}/search`, tr('Searching for {title}.', { title: `${show} ${code(e.season, e.number)}` }))}>
          {tr('Search')}
        </button>
      )}
    </li>
  );
}

const EVENT: Record<HistoryEvent, string> = {
  grabbed: msg('Grabbed'),
  imported: msg('Imported'),
  failed: msg('Failed'),
  deleted: msg('Deleted'),
  renamed: msg('Renamed'),
  ignored: msg('Ignored'),
  other: msg('Other'),
};

function History({ app }: { app: ArrApp }) {
  const { data, err } = useList<HistoryItem[]>(`/api/library/${app}/history`);
  if (err) return <p className="crit-text">{err}</p>;
  if (!data) return <div className="dlp-loading" aria-busy="true" />;
  if (!data.length) return <Empty>{tr('Nothing has happened yet.')}</Empty>;
  return (
    <ul className="lib-list">
      {data.map((h) => (
        <li key={h.id} className={`lib-row no-art lib-history is-${h.event}`}>
          <div className="lib-body">
            <span className="lib-title">
              {h.title}
              {h.subtitle && <span className="lib-year"> {h.subtitle}</span>}
            </span>
            <div className="dlp-meta">
              <span className={h.event === 'failed' ? 'crit-text' : h.event === 'imported' ? 'lib-imported' : undefined}>{tr(EVENT[h.event])}</span>
              <span>{agoLong(h.at)}</span>
              {h.quality && <span>{h.quality}</span>}
              {h.from && <span>{h.from}</span>}
            </div>
            {h.message && <p className={`lib-test ${h.event === 'failed' ? 'crit-text' : 'lib-total'}`}>{h.message}</p>}
            {h.release && <p className="lib-release">{breakable(h.release)}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}

type Say = { ro: boolean; onSaid: (s: string) => void; onErr: (s: string) => void };

const langName = (l: SubtitleLang) => (l.forced ? tr('{lang}, forced', { lang: l.name }) : l.hi ? tr('{lang}, hard of hearing', { lang: l.name }) : l.name);

function Subtitles({ kind, ro, onSaid, onErr }: { kind: SubtitleKind } & Say) {
  const { data, err, reload } = useList<SubtitleList>(`/api/subtitles/${kind}`);
  const [busy, setBusy] = useState('');
  const shows = kind === 'episodes';

  async function search(item: SubtitleItem) {
    const name = [item.title, item.subtitle].filter(Boolean).join(' ');
    setBusy(item.id);
    onSaid('');
    onErr('');
    try {
      const r = await call<{ waiting?: boolean }>(`/api/subtitles/${kind}/${encodeURIComponent(item.id)}/search`, { method: 'POST', headers: ACTION });
      onSaid(r.waiting ? tr('Bazarr is still looking for {title}.', { title: name }) : tr('Searched for {title}.', { title: name }));
      reload();
    } catch (e) {
      onErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function searchAll() {
    onSaid('');
    onErr('');
    try {
      await call(`/api/subtitles/${kind}/search-all`, { method: 'POST', headers: ACTION });
      onSaid(shows ? tr('Bazarr is searching for every episode’s subtitles.') : tr('Bazarr is searching for every film’s subtitles.'));
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  return (
    <>
      {data && data.total > 0 && (
        <div className="lib-filter">
          <span className="lib-total">
            {shows ? tr('{n} episodes need subtitles', { n: data.total }) : tr('{n} films need subtitles', { n: data.total })}
            {data.total > data.items.length ? `, ${tr('newest {n} here', { n: data.items.length })}` : ''}
          </span>
          {!ro && (
            <button type="button" className="button" onClick={() => void searchAll()}>
              {tr('Search for all')}
            </button>
          )}
        </div>
      )}
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : data.items.length === 0 ? (
        <Empty>{shows ? tr('Every episode has its subtitles.') : tr('Every film has its subtitles.')}</Empty>
      ) : (
        <ul className="lib-list">
          {data.items.map((s) => (
            <li key={s.id} className="lib-row no-art">
              <div className="lib-body">
                <span className="lib-title">
                  {s.title}
                  {s.subtitle && <span className="lib-year"> {s.subtitle}</span>}
                </span>
                <div className="dlp-meta">
                  {s.missing.map((l) => (
                    <span key={`${l.code}${l.forced ? 'f' : ''}${l.hi ? 'h' : ''}`}>{langName(l)}</span>
                  ))}
                </div>
              </div>
              {!ro && (
                <div className="lib-actions">
                  <button type="button" className="button button-quiet" disabled={busy === s.id} onClick={() => void search(s)}>
                    {busy === s.id ? tr('Searching') : tr('Search')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Indexers({ ro, onSaid, onErr }: Say) {
  const { data, err, reload } = useList<IndexerList>('/api/indexers');
  const [busy, setBusy] = useState<number | 'all' | null>(null);
  const [tests, setTests] = useState(new Map<number, IndexerTest>());

  async function run(i: Indexer | null, action: 'test' | 'enable' | 'disable') {
    setBusy(i?.id ?? 'all');
    onSaid('');
    onErr('');
    try {
      if (!i) {
        const { results } = await call<{ results: IndexerTest[] }>('/api/indexers/test-all', { method: 'POST', headers: ACTION });
        setTests(new Map(results.map((r) => [r.id, r])));
        onSaid(tr('{ok} of {n} passed.', { ok: results.filter((r) => r.ok).length, n: results.length }));
      } else if (action === 'test') {
        try {
          await call(`/api/indexers/${i.id}/test`, { method: 'POST', headers: ACTION });
          setTests((m) => new Map(m).set(i.id, { id: i.id, name: i.name, ok: true }));
        } catch (e) {
          setTests((m) => new Map(m).set(i.id, { id: i.id, name: i.name, ok: false, error: (e as Error).message }));
        }
      } else {
        await call(`/api/indexers/${i.id}/${action}`, { method: 'POST', headers: ACTION });
        setTests((m) => {
          const next = new Map(m);
          next.delete(i.id);
          return next;
        });
        onSaid(action === 'enable' ? tr('Turned on {name}.', { name: i.name }) : tr('Turned off {name}.', { name: i.name }));
        reload();
      }
    } catch (e) {
      onErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (err) return <p className="crit-text">{err}</p>;
  if (!data) return <div className="dlp-loading" aria-busy="true" />;
  const failing = data.indexers.filter((i) => i.enabled && i.failingUntil).length;
  return (
    <>
      <div className="lib-filter">
        <span className="lib-total">
          {tr('{n} indexers', { n: data.indexers.length })}
          {failing > 0 && <span className="warn-text">, {tr('{n} failing', { n: failing })}</span>}
        </span>
        {!ro && data.indexers.some((i) => i.enabled) && (
          <button type="button" className="button" disabled={busy !== null} onClick={() => void run(null, 'test')}>
            {busy === 'all' ? tr('Testing') : tr('Test all')}
          </button>
        )}
      </div>
      {data.indexers.length === 0 ? (
        <Empty>{tr('Prowlarr has no indexers yet.')}</Empty>
      ) : (
        <ul className="lib-list">
          {data.indexers.map((i) => {
            const test = tests.get(i.id);
            return (
              <li key={i.id} className={`lib-row no-art ${i.enabled ? '' : 'is-off'}`}>
                <div className="lib-body">
                  <span className="lib-title">{i.name}</span>
                  <div className="dlp-meta">
                    <span>{i.protocol === 'usenet' ? tr('Usenet') : tr('Torrent')}</span>
                    {!i.enabled ? (
                      <span>{tr('Off')}</span>
                    ) : (
                      i.failingUntil && <span className="warn-text">{tr('Failing, tries again at {time}', { time: clock(i.failingUntil) })}</span>
                    )}
                    {i.queries != null && <span>{tr('{n} queries', { n: i.queries.toLocaleString() })}</span>}
                    {i.grabs != null && <span>{tr('{n} grabs', { n: i.grabs.toLocaleString() })}</span>}
                    {i.responseMs != null && i.queries ? <span>{tr('{n} ms', { n: Math.round(i.responseMs) })}</span> : null}
                  </div>
                  {test && (test.ok ? <p className="req-done lib-test">{tr('Test passed')}</p> : <p className="crit-text lib-test">{test.error ?? tr('Test failed')}</p>)}
                </div>
                {!ro && (
                  <div className="lib-actions">
                    {i.enabled && (
                      <button type="button" className="button button-quiet" disabled={busy !== null} onClick={() => void run(i, 'test')}>
                        {busy === i.id ? tr('Testing') : tr('Test')}
                      </button>
                    )}
                    <button type="button" className="text-button" disabled={busy !== null} onClick={() => void run(i, i.enabled ? 'disable' : 'enable')}>
                      {i.enabled ? tr('Turn off') : tr('Turn on')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Queue({ app, ro, act }: { app: ArrApp; ro: boolean; act: Act }) {
  const { data, err, reload } = useList<ArrQueueItem[]>(`/api/library/${app}/queue`, QUEUE_EVERY_MS);
  return (
    <>
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : data.length === 0 ? (
        <Empty>{tr('Nothing in the queue.')}</Empty>
      ) : (
        <ul className="dlp-list">
          {data.map((q) => {
            const stuck = q.state === 'failed' || q.state === 'warning';
            return (
              <li key={q.id} className={`dlp-row is-${q.state}`}>
                <div className="dlp-head">
                  <span className="dlp-name" title={q.title}>
                    {breakable(q.title)}
                  </span>
                  <span className={`dlp-how ${q.state === 'failed' ? 'crit-text' : q.state === 'warning' ? 'warn-text' : ''}`}>{tr(QUEUE_STATE[q.state])}</span>
                </div>
                {q.progress < 1 && <Meter value={q.progress * 100} level={q.state === 'failed' ? 'crit' : q.state === 'warning' ? 'warn' : 'ok'} label={tr('{name}, {pct}%', { name: q.title, pct: Math.round(q.progress * 100) })} />}
                <div className="dlp-foot">
                  <div className="dlp-info">{q.message && <p className={`dlp-error ${stuck ? 'warn-text' : ''}`}>{q.message}</p>}</div>
                  {!ro && (
                    <div className="dlp-actions">
                      <HoldButton className="text-button" label={tr('Try another release of {name}', { name: q.title })} hint={tr('Hold to blocklist this release and search for another.')} onConfirm={() => void act(`queue/${q.id}/retry`, tr('Looking for another release of {name}.', { name: q.title }), undefined, reload)}>
                        {tr('Try another')}
                      </HoldButton>
                      <HoldButton className="text-button" danger label={tr('Remove {name}', { name: q.title })} hint={tr('Hold to remove it from the queue and the download client.')} onConfirm={() => void act(`queue/${q.id}/remove`, tr('Removed {name}.', { name: q.title }), undefined, reload)}>
                        {tr('Remove')}
                      </HoldButton>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Add({ app, shows, onAdded }: { app: ArrApp; shows: boolean; onAdded: (title: string) => void }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<FoundItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const { data: options, err: optionsErr } = useList<ArrOptions>(`/api/library/${app}/options`);

  useEffect(() => {
    setFound(null);
    setOpen(null);
  }, [app]);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy(true);
    setErr('');
    setOpen(null);
    try {
      setFound(await call<FoundItem[]>(`/api/library/${app}/find?q=${encodeURIComponent(term.trim())}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form className="dlp-add lib-find" onSubmit={(e) => void find(e)}>
        <input className="field" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={shows ? tr('Find a show by name') : tr('Find a film by name')} aria-label={shows ? tr('Show name') : tr('Film name')} autoComplete="off" />
        <button type="submit" className="button" disabled={busy || !term.trim()}>
          {busy ? tr('Finding') : tr('Find')}
        </button>
      </form>
      {(err || optionsErr) && <p className="crit-text">{err || optionsErr}</p>}
      {found &&
        (found.length === 0 ? (
          <Empty>{tr('Nothing by that name.')}</Empty>
        ) : (
          <ul className="lib-list">
            {found.map((f) => (
              <Row
                key={f.key}
                art={f.art}
                title={f.title}
                actions={
                  f.have ? (
                    <span className="lib-have">{tr('In your library')}</span>
                  ) : open !== f.key ? (
                    <button type="button" className="button button-quiet" onClick={() => setOpen(f.key)}>
                      {tr('Add')}
                    </button>
                  ) : null
                }
              >
                <span className="lib-title">
                  {f.title}
                  {f.year ? <span className="lib-year"> {f.year}</span> : null}
                </span>
                <div className="dlp-meta">
                  {f.by && <span>{f.by}</span>}
                  {f.seasons ? <span>{f.seasons === 1 ? tr('1 season') : tr('{n} seasons', { n: f.seasons })}</span> : null}
                </div>
                {f.overview && <p className="lib-overview">{f.overview}</p>}
                {open === f.key && options && (
                  <AddForm
                    app={app}
                    item={f}
                    options={options}
                    onCancel={() => setOpen(null)}
                    onAdded={() => {
                      setFound((list) => list?.map((x) => (x.key === f.key ? { ...x, have: true } : x)) ?? null);
                      setOpen(null);
                      onAdded(f.title);
                    }}
                  />
                )}
              </Row>
            ))}
          </ul>
        ))}
    </>
  );
}

function AddForm({ app, item, options, onCancel, onAdded }: { app: ArrApp; item: FoundItem; options: ArrOptions; onCancel: () => void; onAdded: () => void }) {
  const [profile, setProfile] = useState(options.profiles[0]?.id ?? 0);
  const [folder, setFolder] = useState(options.folders[0]?.path ?? '');
  const [search, setSearch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!options.profiles.length || !options.folders.length)
    return <p className="crit-text">{app === 'sonarr' ? tr('Sonarr needs a quality profile and a root folder first.') : tr('Radarr needs a quality profile and a root folder first.')}</p>;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await call(`/api/library/${app}/add`, { method: 'POST', headers: ACTION, body: JSON.stringify({ key: item.key, profile, folder, search }) });
      onAdded();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="lib-add" onSubmit={(e) => void add(e)}>
      <label>
        <span>{tr('Quality')}</span>
        <select className="field" value={profile} onChange={(e) => setProfile(Number(e.target.value))}>
          {options.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>{tr('Folder')}</span>
        <select className="field" value={folder} onChange={(e) => setFolder(e.target.value)}>
          {options.folders.map((f) => (
            <option key={f.path} value={f.path}>
              {f.free !== undefined ? tr('{path} ({free} free)', { path: f.path, free: size(f.free) }) : f.path}
            </option>
          ))}
        </select>
      </label>
      <label className="lib-check">
        <input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
        <span>{tr('Search for it now')}</span>
      </label>
      <div className="lib-add-go">
        <button type="submit" className="button" disabled={busy}>
          {busy ? tr('Adding') : tr('Add {title}', { title: item.title })}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          {tr('Cancel')}
        </button>
      </div>
      {err && (
        <p className="crit-text" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
