// Home: exceptions and changes, not inventory. Healthy things collapse into
// one sentence; space goes to what is new, in progress, broken or coming up.

import { Mascot } from '../components/Otter.tsx';
import { STARTERS } from '../../shared/board.ts';
import { useJson } from '../lib/api.ts';
import type { CatalogAudit } from '../../shared/types.ts';
import { adoptAll, saveLayout } from '../lib/adopt.ts';
import { useState } from 'react';
import { useWidget } from '../board/widget-context.ts';
import { Link } from 'react-router-dom';
import { PauseButton, useDownloadClients } from '../lib/downloads.tsx';
import { sameRelease } from '../../shared/media.ts';
import { itemHref, type MergedItem, mergeRecent, useMediaServers } from '../lib/media.ts';
import type {
  Alert,
  ArrData,
  BackupsData,
  ChangeEvent,
  FastmailData,
  MinifluxData,
  ReleaseItem,
  SystemData,
  TraktData,
  TruenasData,
  WeatherData,
} from '../../shared/types.ts';
import { Board } from '../board/Board.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { Empty, Episode, Icon, Ident, Meter, Poster, Section, WithSubject } from '../components/ui.tsx';
import {
  ago,
  agoLong,
  clock,
  deg,
  dayLabel,
  dayOffset,
  eta,
  isDateOnly,
  plural,
  size,
  speed,
  uptime,
  weatherText,
} from '../lib/format.ts';
import { containerMap, isExternal } from '../lib/services.ts';
import { useNow, useSource, useStore } from '../lib/store.tsx';

export function Home() {
  const { snap } = useStore();
  const now = useNow(15_000);
  const [widgets, setWidgets] = useState<string[]>([]);
  if (!snap) return <HomeSkeleton />;
  return (
    <div className="home">
      <Masthead now={now} weatherOnBoard={widgets.includes('weather')} attentionCard={widgets.includes('attention-card')} />
      <Welcome />
      <Board now={now} onWidgets={setWidgets} />
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="home" aria-busy="true">
      <div className="masthead skeleton" style={{ height: 120 }} />
      <div className="patchrow patchrow-loading" />
    </div>
  );
}

function Masthead({ now, weatherOnBoard, attentionCard }: { now: number; weatherOnBoard: boolean; attentionCard: boolean }) {
  const { snap } = useStore();
  const { data: weather } = useSource<WeatherData>('weather');
  const { clock24, temp: unit } = useAppearance();
  const d = new Date(now);
  const time = d
    .toLocaleTimeString(undefined, { hour: clock24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !clock24 })
    .replace(/\s?[AP]M$/i, '');
  const meridiem = clock24 ? undefined : d.toLocaleTimeString(undefined, { hour: 'numeric', hour12: true }).match(/[AP]M/i)?.[0];
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const alerts = snap!.alerts.filter((a) => a.level !== 'info');
  const night = d.getHours() >= 23 || d.getHours() < 6;
  const running = [...containerMap(snap).values()].filter((c) => c.state === 'running').length;
  const dockerOk = !!snap!.sources.docker?.ok;
  const status =
    alerts.length === 0
      ? dockerOk
        ? { tone: 'ok', text: `All quiet. ${running} containers running.` }
        : { tone: 'warn', text: "Can't see Docker right now." }
      : { tone: alerts.some((a) => a.level === 'critical') ? 'crit' : 'warn', text: `${alerts.length === 1 ? 'One thing needs' : `${alerts.length} things need`} you.` };

  return (
    <header className="masthead">
      <div className="masthead-time">
        <span className="clock">
          {time}
          {meridiem && <small>{meridiem}</small>}
        </span>
        <Link to="/upcoming" className="date" title="What's coming this week">
          {date}
        </Link>
      </div>
      {weather && !weatherOnBoard && (
        <Link to="/weather" className="masthead-weather" title="Hourly, the week, sunrise and alerts">
          <span className="temp">{deg(weather.tempNow, unit)}°</span>
          <span className="weather-text">
            {weatherText(weather.codeNow)} in {weather.label}.
            <br />
            High {deg(weather.days[0]?.high ?? 0, unit)}°, low {deg(weather.days[0]?.low ?? 0, unit)}°
            {(weather.days[0]?.precipPct ?? 0) >= 30 && `, ${weather.days[0].precipPct}% chance of rain`}.
          </span>
          <ol className="forecast" aria-label="Next three days">
            {weather.days.slice(1, 4).map((w) => (
              <li key={w.date}>
                <span>{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <strong>{deg(w.high, unit)}°</strong>
                <span className="forecast-cond">{weatherText(w.code)}</span>
              </li>
            ))}
          </ol>
          {(weather.alerts ?? []).length > 0 && <span className="masthead-alert">{weather.alerts![0].event}</span>}
        </Link>
      )}
      <div className={`masthead-status tone-${status.tone}`}>
        {!attentionCard && !alerts.length ? (
          <Link className="status-line is-quiet" to="/stacks">
            <Mascot mood={night ? 'asleep' : 'calm'} size={40} />
            <span>{status.text}</span>
          </Link>
        ) : attentionCard || !alerts.length ? (
          <a className="status-line" href={alerts.length ? '#w-attention' : '/stacks'} onClick={(e) => {
              if (!alerts.length) return;
              e.preventDefault();
              document.getElementById('w-attention')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
            <span className="status-led" aria-hidden />
            <span>{status.text}</span>
          </a>
        ) : (
          <h2 className="status-line">
            <span className="status-led" aria-hidden />
            <span>{status.text}</span>
          </h2>
        )}
        {!attentionCard && <HeaderAlerts alerts={snap!.alerts} now={now} />}
        <Overnight now={now} />
      </div>
    </header>
  );
}

/**
 * Needs attention in the header: one line per problem under the status line,
 * worst first, each one a link to its fix. Three show; the rest open in place.
 */
function HeaderAlerts({ alerts, now }: { alerts: Alert[]; now: number }) {
  const [all, setAll] = useState(false);
  // Problems first, worst first; then quiet notes, like an app Patchboard
  // can't reach, in gray.
  const list = [...alerts.filter((a) => a.level === 'critical'), ...alerts.filter((a) => a.level === 'warn'), ...alerts.filter((a) => a.level === 'info')];
  if (!list.length) return null;
  const SHOWN = 3;
  const shown = all ? list : list.slice(0, SHOWN);
  return (
    <ul className="head-alerts" aria-label="Needs attention">
      {shown.map((a) => {
        const body = (
          <>
            <span className="head-alert-title">
              <WithSubject title={a.title} subject={a.subject} />
            </span>
            {a.since && <span className="head-alert-since">{agoLong(a.since, now)}</span>}
          </>
        );
        return (
          <li key={a.id} className={`head-alert alert-${a.level}`} title={a.detail}>
            {a.href ? isExternal(a.href) ? <a href={a.href} target="_blank" rel="noreferrer">{body}</a> : <Link to={a.href}>{body}</Link> : <span>{body}</span>}
          </li>
        );
      })}
      {list.length > SHOWN && (
        <li className="head-alert-more">
          <button type="button" className="text-button" onClick={() => setAll(!all)}>
            {all ? 'Show fewer' : `${list.length - SHOWN} more`}
          </button>
        </li>
      )}
    </ul>
  );
}

/** One quiet line about the nightly jobs, while they're recent. */
function Overnight({ now }: { now: number }) {
  const { data } = useSource<BackupsData>('backups');
  if (!data) return null;
  const db = data.db[data.db.length - 1];
  const files = data.files[data.files.length - 1];
  const fresh = (r?: { startedAt: number }) => !!r && now - r.startedAt < 20 * 3_600_000;
  if (!fresh(db) && !fresh(files)) return null;
  const part = (r: typeof db | undefined, noun: string) => {
    if (!fresh(r) || !r) return null;
    const bad = r.items.filter((i) => !i.ok).length;
    return bad ? `${bad} ${noun} backup${bad === 1 ? '' : 's'} failed` : `${r.items.length} ${noun}`;
  };
  const parts = [part(db, db && db.items.length === 1 ? 'database' : 'databases'), part(files, 'file sets')].filter(Boolean);
  const anyBad = [db, files].some((r) => fresh(r) && r!.items.some((i) => !i.ok));
  return (
    <Link to="/server#backups" className={`overnight ${anyBad ? 'is-bad' : ''}`}>
      {anyBad ? 'Overnight: ' : 'Backed up overnight: '}
      {parts.join(', ')}.
    </Link>
  );
}

export function Attention({ alerts, now }: { alerts: Alert[]; now: number }) {
  const serious = alerts.filter((a) => a.level !== 'info').length;
  const h = new Date(now).getHours();
  const night = h >= 23 || h < 6;
  // The otter stays whenever nothing is wrong, even with a quiet note below.
  const clear = serious === 0 && (
    <div className="all-clear">
      <Mascot mood={night ? 'asleep' : 'calm'} size={88} />
      <p>
        <strong>Nothing needs you.</strong>
        <br />
        {night ? 'Everything is running. Get some sleep.' : 'Everything is running. The otter is keeping watch.'}
      </p>
    </div>
  );
  if (!alerts.length) return <Section title="Needs attention" className="attention">{clear}</Section>;
  return (
    <Section title="Needs attention" count={serious || undefined} className="attention">
      {clear}
      <ul className="alerts">
        {alerts.map((a) => {
          const body = (
            <>
              <span className="alert-title">
                <WithSubject title={a.title} subject={a.subject} />
              </span>
              {a.detail && <span className="alert-detail">{a.detail}</span>}
              {a.since && <span className="alert-since">{agoLong(a.since, now)}</span>}
            </>
          );
          return (
            <li key={a.id} className={`alert alert-${a.level}`}>
              {a.href ? (
                isExternal(a.href) ? (
                  <a href={a.href} target="_blank" rel="noreferrer">{body}</a>
                ) : (
                  <Link to={a.href}>{body}</Link>
                )
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function Inbox({ now }: { now: number }) {
  const { state, data } = useSource<FastmailData>('fastmail');
  const { limit = 6 } = useWidget();
  if (!state) return null;
  return (
    <Section
      title="Inbox"
      className="inbox"
      count={data ? (data.unread ? `${data.unread} unread` : 'Nothing unread') : undefined}
      action={data ? { label: 'Open Fastmail', href: data.webUrl } : undefined}
      source={state}
    >
      {data?.messages.length ? (
        <ul className="mail">
          {data.messages.slice(0, limit).map((m) => (
            <li key={m.id} className={m.unread ? 'is-unread' : undefined}>
              <a href={data.webUrl} target="_blank" rel="noreferrer" title={m.preview}>
                <span className="mail-from">{m.from}</span>
                <span className="mail-subject">{m.subject}</span>
                <time className="mail-time">{ago(m.receivedAt, now)}</time>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{data ? 'Inbox zero. Nothing waiting.' : 'Connecting to Fastmail.'}</Empty>
      )}
    </Section>
  );
}

export function FeedsBrief({ now }: { now: number }) {
  const { state, data } = useSource<MinifluxData>('miniflux');
  const { limit = 6 } = useWidget();
  const fp = useStore().snap?.pages?.feeds;
  const feedHidden = (e: { feed: string; category: string }) => !!fp?.hideFeeds?.includes(e.feed) || !!fp?.hideCategories?.includes(e.category);
  if (!state) return null;
  return (
    <Section
      title="Feeds"
      className="feeds-brief"
      count={data ? `${data.unread} unread` : undefined}
      action={data?.unread ? { label: 'Read all', to: '/feeds' } : undefined}
      source={state}
    >
      {data?.entries.length ? (
        <ul className="feedlist">
          {data.entries
            .filter((e) => !feedHidden(e))
            .slice(0, limit)
            .map((e) => (
            <li key={e.id}>
              <Link to={`/feeds?e=${e.id}`}>
                <span className="feed-title">{e.title}</span>
                <span className="feed-meta">
                  <span>{e.feed}</span>
                  <time>{ago(e.publishedAt, now)}</time>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>You're caught up on feeds.</Empty>
      )}
    </Section>
  );
}

export function NowPlaying() {
  const { servers, configured } = useMediaServers();
  const { clients, configured: anyClient } = useDownloadClients();
  if (!configured && !anyClient) return null;

  return (
    <Section title="Right now" className="now">
      {servers.map((m) => (
        <div className="now-block" key={m.id}>
          <h3>
            <Link to={`/c/${m.container}`}>{m.data.streams.length ? `${plural(m.data.streams.length, 'stream')} on ${m.label}` : `Nobody is watching ${m.label}`}</Link>
          </h3>
          {m.data.streams.map((s, i) => (
            <div className="stream" key={i}>
              <div className="stream-line">
                <span className="stream-title">
                  {s.title}
                  {s.subtitle && (
                    <span className="stream-sub">
                      {' '}
                      <Episode text={s.subtitle} />
                    </span>
                  )}
                </span>
                <span className="stream-user">
                  {s.user}
                  {s.state === 'paused' ? ', paused' : ''}
                  {s.transcode ? ', transcoding' : ''}
                </span>
              </div>
              <Meter value={s.progress} level={s.state === 'paused' ? 'warn' : 'ok'} />
            </div>
          ))}
        </div>
      ))}

      {clients.map((d) => (
        <div className="now-block" key={d.id}>
          <h3 className="now-head">
            <Link to={`/c/${d.container}`}>
              {d.data.paused
                ? `${d.label} is paused`
                : d.data.downloading
                  ? `Downloading ${d.data.downloading} in ${d.label} at ${speed(d.data.down)}`
                  : `Nothing downloading in ${d.label}`}
            </Link>
            <PauseButton client={d} />
          </h3>
          {!d.data.paused &&
            d.data.active.map((t) => (
              <div className="stream" key={t.name}>
                <div className="stream-line">
                  <span className="stream-title torrent-name">{t.name}</span>
                  <span className="stream-user">{t.speed ? eta(t.etaSec) || speed(t.speed) : 'Queued'}</span>
                </div>
                <Meter value={t.progress * 100} level="ok" />
              </div>
            ))}
          {d.data.kind !== 'usenet' && !d.data.paused && (
            <p className="now-foot">
              Seeding {d.data.seeding}, uploading at {speed(d.data.up)}
              {d.data.stalled ? `. ${d.data.stalled} stalled` : ''}.
            </p>
          )}
          {d.data.errored.length > 0 && <p className="now-foot crit-text">{plural(d.data.errored.length, 'download')} failed: {d.data.errored.slice(0, 2).join(', ')}</p>}
        </div>
      ))}

    </Section>
  );
}

/** Merge Sonarr, Radarr and Trakt, preferring the *arr entry for duplicates. */
export function useReleases(): { items: ReleaseItem[]; any: boolean; all: ReleaseItem[] } {
  const page = useStore().snap?.pages?.upcoming;
  const sonarr = useSource<ArrData>('sonarr');
  const radarr = useSource<ArrData>('radarr');
  const trakt = useSource<TraktData>('trakt');
  // Sonarr and Radarr first: they know what's downloaded and have artwork.
  // Trakt fills in what they don't track, matched by TVDB/TMDB id or by title.
  const seen = new Set<string>();
  const items: ReleaseItem[] = [];
  for (const list of [sonarr.data?.upcoming, radarr.data?.upcoming, trakt.data?.upcoming]) {
    for (const it of list ?? []) {
      const keys = [it.key, ...(it.alt ?? [])];
      if (seen.has(it.key) || (it.source === 'trakt' && keys.some((k) => seen.has(k)))) continue;
      keys.forEach((k) => seen.add(k));
      items.push(it);
    }
  }
  items.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  const hideSrc = new Set((page?.hideSources ?? []).map((x) => x.toLowerCase()));
  const hideShow = new Set(page?.hideShows ?? []);
  const shown = items.filter((it) => !hideSrc.has(it.source) && !hideShow.has(it.title));
  return { items: shown, all: items, any: !!(sonarr.state || radarr.state || trakt.state) };
}

export function UpcomingBrief({ now }: { now: number }) {
  const { items, any } = useReleases();
  const { limit = 9, days = 7 } = useWidget();
  if (!any) return null;
  const week = items.filter((i) => {
    const off = dayOffset(i.when, now);
    return off >= 0 && off < days;
  });
  const byDay = new Map<string, ReleaseItem[]>();
  for (const it of groupDrops(week).slice(0, limit)) {
    const label = dayLabel(it.when, now);
    byDay.set(label, [...(byDay.get(label) ?? []), it]);
  }
  return (
    <Section title={days > 7 ? 'Next two weeks' : 'This week'} className="upcoming-brief" count={week.length ? plural(week.length, 'release') : undefined} action={{ label: 'Two weeks', to: '/upcoming' }}>
      {byDay.size ? (
        <div className="agenda agenda-compact">
          {[...byDay].map(([day, list]) => (
            <div className="agenda-day" key={day}>
              <h3>{day}</h3>
              <ul>
                {list.map((it) => (
                  <ReleaseRow key={it.id} it={it} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <Empty>Nothing on the calendar for the next seven days.</Empty>
      )}
    </Section>
  );
}

export function ReleaseRow({ it, art = false }: { it: ReleaseItem; art?: boolean }) {
  const time = it.kind === 'movie' || isDateOnly(it.when) ? '' : clock(it.when);
  const content = (
    <>
      {art && (
        <span className="rel-art">
          <Poster title={it.title} thumb={it.art} small />
        </span>
      )}
      <span className="rel-time">{time}</span>
      <span className="rel-main">
        <span className="rel-title">{it.title}</span>
        {it.subtitle && (
          <span className="rel-sub">
            <Episode text={it.subtitle} />
          </span>
        )}
      </span>
      <span className={`rel-src src-${it.source}`}>{it.hasFile ? 'Downloaded' : sourceName[it.source]}</span>
    </>
  );
  return (
    <li className={`rel ${it.hasFile ? 'has-file' : ''} ${art ? 'with-art' : ''}`}>
      {it.url && it.url !== '#' ? (
        <a href={it.url} target="_blank" rel="noreferrer">{content}</a>
      ) : (
        <div>{content}</div>
      )}
    </li>
  );
}

const sourceName = { sonarr: 'Sonarr', radarr: 'Radarr', trakt: 'Trakt' };

const changeText: Record<ChangeEvent['kind'], string> = {
  'container.stopped': 'stopped',
  'container.started': 'started',
  'container.unhealthy': 'started failing its health check',
  'container.recovered': 'recovered',
  'container.action': 'was sent a command',
};

const actionText: Record<string, string> = {
  restart: 'restarted from Patchboard',
  stop: 'stopped from Patchboard',
  start: 'started from Patchboard',
  update: 'updated from Patchboard',
  rollback: 'rolled back from Patchboard',
};

export function Changes({ changes, now }: { changes: ChangeEvent[]; now: number }) {
  const { limit = 6 } = useWidget();
  if (!changes.length) return null;
  return (
    <Section title="Changes" className="changes-sec" count="last 48 hours">
      <ul className="changes">
        {changes.slice(0, limit).map((c) => (
          <li key={c.id} className={`change change-${c.kind.split('.')[1]}`}>
            <Link to={`/c/${c.subject}`}>
              <span className="change-text">
                <Ident>{c.subject}</Ident> {c.kind === 'container.action' ? (actionText[c.detail ?? ''] ?? changeText[c.kind]) : changeText[c.kind]}
              </span>
              <time>{ago(c.at, now)}</time>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function RecentlyAdded({ now }: { now: number }) {
  const { servers } = useMediaServers();
  const { limit = 12 } = useWidget();
  const items = mergeRecent(servers);
  if (!items.length) return null;
  const title = servers.length === 1 ? `Recently added to ${servers[0].label}` : 'Recently added';
  return (
    <Section title={title} className="recent">
      <PosterShelf items={items.slice(0, limit)} now={now} showServer={servers.length > 1} />
    </Section>
  );
}

/** Jellyfin and Emby: the next episode of each show you're watching. */
export function NextUp() {
  const { servers } = useMediaServers();
  const { limit = 12 } = useWidget();
  const all = servers.flatMap((server) => ('nextUp' in server.data ? server.data.nextUp.map((r) => ({ ...r, server })) : []));
  // Jellyfin and Emby on one library suggest the same episode: show it once.
  const items = all.filter((r, i) => !all.slice(0, i).some((o) => sameRelease(o, r)));
  if (!items.length) return null;
  return (
    <Section title="Next up" className="recent">
      <PosterShelf items={items.slice(0, limit)} showServer={servers.length > 1} />
    </Section>
  );
}

function PosterShelf({ items, now, showServer }: { items: MergedItem[]; now?: number; showServer: boolean }) {
  return (
    <ul className="posters">
      {items.map((r) => {
        const href = itemHref(r.server, r.id);
        return (
          <li key={`${r.server.id}:${r.id}:${r.subtitle ?? ''}`}>
            <a className="poster-link" href={href} target="_blank" rel="noreferrer" title={href ? `Open in ${r.server.label}` : undefined}>
              <Poster title={r.title} thumb={r.thumb} />
              <span className="poster-title">{r.title}</span>
              <span className="poster-sub">
                {r.subtitle && <Episode text={r.subtitle} />}
                {now !== undefined && <time>{ago(r.addedAt, now)}</time>}
                {showServer && <span className="poster-src">{(r.servers ?? [r.server]).map((s) => s.label).join(' + ')}</span>}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A season dropped at once becomes one row: "S02E01 to E08, 8 episodes".
 * Only consecutive episodes of one show, on one day, from one source.
 */
export function groupDrops(list: ReleaseItem[]): ReleaseItem[] {
  const out: ReleaseItem[] = [];
  const ep = (it: ReleaseItem) => /^S(\d+)E(\d+)/.exec(it.subtitle ?? '');
  for (const it of list) {
    const prev = out[out.length - 1];
    const a = prev && ep(prev);
    const b = ep(it);
    if (prev && a && b && it.kind === 'episode' && prev.title === it.title && prev.source === it.source && a[1] === b[1] && new Date(prev.when).toDateString() === new Date(it.when).toDateString()) {
      const first = (prev as ReleaseItem & { _first?: string })._first ?? `S${a[1]}E${a[2]}`;
      const count = ((prev as ReleaseItem & { _count?: number })._count ?? 1) + 1;
      out[out.length - 1] = { ...prev, subtitle: `${first} to E${b[2]}, ${count} episodes`, _first: first, _count: count } as ReleaseItem;
      continue;
    }
    out.push(it);
  }
  return out;
}

/**
 * First run: no apps yet. Offer the containers already running, grouped by
 * stack, in one click; or picking them; then the two places to make it yours.
 * Gone as soon as there's one app.
 */
function Welcome() {
  const { snap } = useStore();
  // A fresh install: hardly any apps (a label or two) and nothing arranged yet.
  const count = snap?.catalog.groups.reduce((n, g) => n + g.services.length, 0) ?? 0;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('pb-welcome-hidden') === '1';
    } catch {
      return false;
    }
  });
  const none = !!snap && count < 5 && !snap.catalog.ordered && !dismissed;
  const audit = useJson<CatalogAudit>(none ? '/api/catalog/audit' : null, 60_000);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!snap || !none) return null;
  const found = audit.data?.discovered ?? [];
  const docker = snap.sources.docker;
  const addAll = async () => {
    setBusy(true);
    setErr('');
    let existing = null;
    try {
      existing = await (await fetch('/api/app-order')).json();
    } catch {
      /* none yet */
    }
    const e = await saveLayout(adoptAll(found, existing));
    setBusy(false);
    if (e) setErr(e);
  };
  return (
    <section className="welcome" aria-label="Getting started">
      <header className="welcome-head">
        <Mascot mood="happy" size={56} />
        <h2>Welcome to Patchboard.</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem('pb-welcome-hidden', '1');
            } catch {
              /* fine: it just comes back next time */
            }
          }}
        >
          Hide this
        </button>
      </header>
      <ol className="welcome-steps">
        <li>
          <strong>Your apps.</strong>{' '}
          {!docker?.ok ? (
            <span>
              Patchboard can't see Docker yet. Mount <code>/var/run/docker.sock</code> (read-only is fine) or set <code>DOCKER_HOST</code>, then reload.
            </span>
          ) : found.length ? (
            <span>
              {found.length} {found.length === 1 ? 'container is' : 'containers are'} running.{' '}
              {!snap.readOnly && (
                <>
                  <button type="button" className="button board-save" disabled={busy} onClick={() => void addAll()}>
                    {busy ? 'Adding...' : `Add all ${found.length}, grouped by stack`}
                  </button>{' '}
                  or <Link to="/apps?arrange=1">pick them one by one</Link>.
                </>
              )}
            </span>
          ) : (
            <span>Looking for running containers...</span>
          )}
          {err && <span className="crit-text"> {err}</span>}
        </li>
        <li>
          <strong>Home.</strong> Start from a layout:{' '}
          {STARTERS.map((st, i) => (
            <span key={st.id}>
              {i > 0 && ', '}
              <button
                type="button"
                className="text-button"
                title={st.about}
                onClick={async () => {
                  await fetch('/api/board', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(st.board) });
                  location.reload();
                }}
              >
                {st.name}
              </button>
            </span>
          ))}
          . Customize, top right of the board, changes any of it.
        </li>
        <li>
          <strong>Your look.</strong> <Link to="/settings">Settings</Link> has themes, accent colors, type and density.
        </li>
      </ol>
      <p className="settings-note">
        Prefer files? A <code>services.yaml</code> or <code>patchboard.*</code> Docker labels work too, and so do Homepage's labels.
      </p>
    </section>
  );
}
