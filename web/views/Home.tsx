// Home: exceptions and changes, not inventory. Healthy things collapse into
// one sentence; space goes to what is new, in progress, broken or coming up.

import { Link } from 'react-router-dom';
import type {
  Alert,
  ArrData,
  BackupsData,
  ChangeEvent,
  FastmailData,
  MinifluxData,
  QbitData,
  ReleaseItem,
  SystemData,
  TautulliData,
  TraktData,
  TruenasData,
  WeatherData,
} from '../../shared/types.ts';
import { PatchRow } from '../components/PatchRow.tsx';
import { Empty, Episode, Icon, Ident, Meter, Poster, Section, WithSubject } from '../components/ui.tsx';
import {
  ago,
  agoLong,
  clock,
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
  if (!snap) return <HomeSkeleton />;

  return (
    <div className="home">
      <Masthead now={now} />
      <PatchRow />
      <div className="home-grid">
        <div className="home-col">
          <Attention alerts={snap.alerts} now={now} />
          <Inbox now={now} />
          <FeedsBrief now={now} />
        </div>
        <div className="home-col">
          <NowPlaying />
          <UpcomingBrief now={now} />
          <Changes changes={snap.changes} now={now} />
        </div>
      </div>
      <RecentlyAdded now={now} />
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

function Masthead({ now }: { now: number }) {
  const { snap } = useStore();
  const { data: weather } = useSource<WeatherData>('weather');
  const d = new Date(now);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  const meridiem = d.toLocaleTimeString(undefined, { hour: 'numeric' }).match(/[AP]M/i)?.[0];
  const date = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const alerts = snap!.alerts.filter((a) => a.level !== 'info');
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
        <span className="date">{date}</span>
      </div>
      {weather && (
        <div className="masthead-weather">
          <span className="temp">{weather.tempNow}°</span>
          <span className="weather-text">
            {weatherText(weather.codeNow)} in {weather.label}.
            <br />
            High {weather.days[0]?.high}°, low {weather.days[0]?.low}°
            {(weather.days[0]?.precipPct ?? 0) >= 30 && `, ${weather.days[0].precipPct}% chance of rain`}.
          </span>
          <ol className="forecast" aria-label="Next three days">
            {weather.days.slice(1, 4).map((w) => (
              <li key={w.date}>
                <span>{new Date(`${w.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                <strong>{w.high}°</strong>
                <span className="forecast-cond">{weatherText(w.code)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className={`masthead-status tone-${status.tone}`}>
        <span className="status-line">
          <span className="status-led" aria-hidden />
          <span>{status.text}</span>
        </span>
        <Overnight now={now} />
      </div>
    </header>
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

function Attention({ alerts, now }: { alerts: Alert[]; now: number }) {
  if (!alerts.length) return null;
  const serious = alerts.filter((a) => a.level !== 'info').length;
  return (
    <Section title="Needs attention" count={serious || undefined} className="attention">
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

function Inbox({ now }: { now: number }) {
  const { state, data } = useSource<FastmailData>('fastmail');
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
          {data.messages.slice(0, 6).map((m) => (
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

function FeedsBrief({ now }: { now: number }) {
  const { state, data } = useSource<MinifluxData>('miniflux');
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
          {data.entries.slice(0, 6).map((e) => (
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

function NowPlaying() {
  const { data: plex, state: plexState } = useSource<TautulliData>('tautulli');
  const { data: qbit, state: qbitState } = useSource<QbitData>('qbit');
  const { data: sys } = useSource<SystemData>('system');
  const { data: nas } = useSource<TruenasData>('truenas');
  const streams = plex?.streams ?? [];
  // The TrueNAS pool is the real number; statfs sees only one dataset.
  const mainPool = nas?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
  const storagePct = mainPool?.usedPct ?? sys?.pool?.usedPct ?? null;

  return (
    <Section title="Right now" className="now">
      {plexState && (
        <div className="now-block">
          <h3>{streams.length ? `${plural(streams.length, 'stream')} on Plex` : 'Nobody is watching Plex'}</h3>
          {streams.map((s, i) => (
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
      )}

      {qbitState && qbit && (
        <div className="now-block">
          <h3>
            {qbit.downloading ? `Downloading ${qbit.downloading} at ${speed(qbit.down)}` : 'No downloads running'}
          </h3>
          {qbit.active.map((t) => (
            <div className="stream" key={t.name}>
              <div className="stream-line">
                <span className="stream-title torrent-name">{t.name}</span>
                <span className="stream-user">{eta(t.etaSec) || speed(t.speed)}</span>
              </div>
              <Meter value={t.progress * 100} level="ok" />
            </div>
          ))}
          <p className="now-foot">
            Seeding {qbit.seeding}, uploading at {speed(qbit.up)}
            {qbit.stalled ? `. ${qbit.stalled} stalled` : ''}.
          </p>
        </div>
      )}

      {sys && (
        <Link to="/server" className="now-block vitals" aria-label="Server details">
          <div className="vital">
            <span className="vital-num">{Math.round(sys.cpuPct)}%</span>
            <span className="vital-label">CPU</span>
          </div>
          {sys.mem && (
            <div className="vital">
              <span className="vital-num">{size(Math.max(0, sys.mem.total - sys.mem.available - sys.mem.arc))}</span>
              <span className="vital-label">Memory in use</span>
            </div>
          )}
          {storagePct != null && (
            <div className="vital vital-wide">
              <span className="vital-num">{Math.round(storagePct)}%</span>
              <span className="vital-label">Storage used</span>
              <Meter value={storagePct} level={storagePct >= 95 ? 'crit' : storagePct >= 85 ? 'warn' : 'ok'} />
            </div>
          )}
          <div className="vital">
            <span className="vital-num">{uptime(sys.uptimeSec)}</span>
            <span className="vital-label">Uptime</span>
          </div>
        </Link>
      )}
    </Section>
  );
}

/** Merge Sonarr, Radarr and Trakt, preferring the *arr entry for duplicates. */
export function useReleases(): { items: ReleaseItem[]; any: boolean } {
  const sonarr = useSource<ArrData>('sonarr');
  const radarr = useSource<ArrData>('radarr');
  const trakt = useSource<TraktData>('trakt');
  const seen = new Set<string>();
  const items: ReleaseItem[] = [];
  for (const list of [sonarr.data?.upcoming, radarr.data?.upcoming, trakt.data?.upcoming]) {
    for (const it of list ?? []) {
      if (seen.has(it.key)) continue;
      seen.add(it.key);
      items.push(it);
    }
  }
  items.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  return { items, any: !!(sonarr.state || radarr.state || trakt.state) };
}

function UpcomingBrief({ now }: { now: number }) {
  const { items, any } = useReleases();
  if (!any) return null;
  const week = items.filter((i) => {
    const off = dayOffset(i.when, now);
    return off >= 0 && off < 7;
  });
  const byDay = new Map<string, ReleaseItem[]>();
  for (const it of week.slice(0, 9)) {
    const label = dayLabel(it.when, now);
    byDay.set(label, [...(byDay.get(label) ?? []), it]);
  }
  return (
    <Section title="This week" className="upcoming-brief" count={week.length ? plural(week.length, 'release') : undefined} action={{ label: 'Two weeks', to: '/upcoming' }}>
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

export function ReleaseRow({ it }: { it: ReleaseItem }) {
  const time = it.kind === 'movie' || isDateOnly(it.when) ? '' : clock(it.when);
  const content = (
    <>
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
    <li className={`rel ${it.hasFile ? 'has-file' : ''}`}>
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

function Changes({ changes, now }: { changes: ChangeEvent[]; now: number }) {
  if (!changes.length) return null;
  return (
    <Section title="Changes" className="changes-sec" count="last 48 hours">
      <ul className="changes">
        {changes.slice(0, 6).map((c) => (
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

function RecentlyAdded({ now }: { now: number }) {
  const { state, data } = useSource<TautulliData>('tautulli');
  if (!state || !data?.recent.length) return null;
  return (
    <Section title="Recently added to Plex" className="recent">
      <ul className="posters">
        {data.recent.map((r) => (
          <li key={r.id}>
            <Poster title={r.title} thumb={r.thumb} />
            <span className="poster-title">{r.title}</span>
            <span className="poster-sub">
              {r.subtitle && <Episode text={r.subtitle} />}
              <time>{ago(r.addedAt, now)}</time>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
