// Home: exceptions and changes, not inventory. Healthy things collapse into
// one sentence; space goes to what is new, in progress, broken or coming up.

import { HeaderServer } from '../components/HeaderServer.tsx';
import { StreamRow } from '../components/StreamRow.tsx';
import { HOME_ID, STARTERS } from '../../shared/board.ts';
import { forThisServer } from '../board/ready.ts';
import { NameForm } from '../components/BrandName.tsx';
import { useJson } from '../lib/api.ts';
import type { CatalogAudit, ListeningData } from '../../shared/types.ts';
import { adoptAll, saveLayout } from '../lib/adopt.ts';
import { Fragment, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWidget } from '../board/widget-context.ts';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
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
import { Board, cachedWidgetTypes, Vitals } from '../board/Board.tsx';
import { getAppearance, useAppearance } from '../lib/appearance.ts';
import { Empty, Episode, Icon, Ident, Led, Meter, Poster, Section, WithSubject } from '../components/ui.tsx';
import {
  count,
  ago,
  agoLong,
  breakable,
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
import { containerMap, ctrState, isExternal, serviceFor } from '../lib/services.ts';
import { useNow, useSource, useStore } from '../lib/store.tsx';
import { byUrgency, needsYou } from '../lib/attention.ts';
import { locale } from '../lib/region.ts';
import { t, tn } from '../lib/i18n.ts';

export function Home() {
  const { snap } = useStore();
  const { board = HOME_ID } = useParams();
  const now = useNow(15_000);
  // From a board fetched ahead when there is one, so a wall board drawn out
  // of sight (a household device's next page) is already a wall board.
  const [widgets, setWidgets] = useState<string[]>(() => cachedWidgetTypes(board, getAppearance().homeStatusSize));
  // A wall board: one status line instead of the header, no tabs, and on a
  // household device no navigation either; swiping moves between pages.
  const wall = widgets.includes('@wall');
  useLayoutEffect(() => {
    document.documentElement.toggleAttribute('data-wall', wall);
    return () => document.documentElement.removeAttribute('data-wall');
  }, [wall]);
  if (!snap) return <HomeSkeleton />;
  return (
    <div className="home">
      {/* The page's name for screen readers and headings lists; the board says it visually. */}
      <h1 className="sr-only">
        {snap.brand?.name || 'Patchboard'}, {board === HOME_ID ? 'Home' : (snap.boards?.find((b) => b.id === board)?.name ?? 'board')}
      </h1>
      <Masthead now={now} weatherOnBoard={widgets.includes('weather')} attentionCard={widgets.includes('attention-card')} slim={wall} />
      {board === HOME_ID && <Welcome />}
      {!wall && <BoardTabs />}
      <Board key={board} id={board} now={now} onWidgets={setWidgets} />
    </div>
  );
}

/** One tab per board, once there is more than Home. */
function BoardTabs() {
  const { snap } = useStore();
  const boards = snap?.boards ?? [];
  if (boards.length < 2) return null;
  return (
    <nav className="board-tabs" aria-label="Boards">
      {boards.map((b) => (
        <NavLink key={b.id} to={b.id === HOME_ID ? '/' : `/b/${b.id}`} end className="board-tab">
          {b.name}
        </NavLink>
      ))}
    </nav>
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

function Masthead({ now, weatherOnBoard, attentionCard, slim }: { now: number; weatherOnBoard: boolean; attentionCard: boolean; slim?: boolean }) {
  const { snap } = useStore();
  const { data: weather } = useSource<WeatherData>('weather');
  const { clock24, temp: unit, homeClockSize, homeStatusSize, homeWeather, homeServer } = useAppearance();
  const d = new Date(now);
  // The time and its AM or PM apart, in whatever words the region uses for them.
  const parts = new Intl.DateTimeFormat(locale(), { hour: clock24 ? '2-digit' : 'numeric', minute: '2-digit', hour12: !clock24 }).formatToParts(d);
  const time = parts
    .filter((p) => p.type !== 'dayPeriod')
    .map((p) => p.value)
    .join('')
    .trim();
  const meridiem = parts.find((p) => p.type === 'dayPeriod')?.value;
  const date = d.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' });

  const alerts = snap!.alerts.filter((a) => a.level !== 'info');
  const running = [...containerMap(snap).values()].filter((c) => c.state === 'running').length;
  const dockerOk = !!snap!.sources.docker?.ok;
  const blind = blindSpot(snap!);
  const status =
    alerts.length === 0
      ? !dockerOk
        ? { tone: 'warn', text: t("Can't see Docker right now.") }
        : blind
          ? { tone: 'warn', text: blind }
          : { tone: 'ok', text: tn(running, 'All quiet. {n} container running.', 'All quiet. {n} containers running.') }
      : { tone: alerts.some((a) => a.level === 'critical') ? 'crit' : 'warn', text: tn(alerts.length, 'One thing needs you.', '{n} things need you.') };
  // A quiet line leads to what's running, or to the integrations it can't reach.
  const quietTo = blind ? '/settings?tab=connections' : '/stacks';

  if (slim) {
    return (
      <header className={`wall-status tone-${status.tone}`}>
        <span className="status-line">{status.text}</span>
        {!attentionCard && <HeaderAlerts alerts={snap!.alerts} now={now} />}
      </header>
    );
  }
  if (homeStatusSize === 'hidden' && homeServer === 'hidden' && homeClockSize === 'hidden' && (!weather || weatherOnBoard || homeWeather === 'hidden')) return null;

  return (
    <header className={`masthead home-header status-${homeStatusSize} clock-${homeClockSize}${status.tone === 'ok' ? ' is-quiet' : ''}`}>
      {homeStatusSize !== 'hidden' && <div className={`masthead-status tone-${status.tone}`}>
        <div className="status-copy">
          {!attentionCard && !alerts.length ? (
            <Link className="status-line is-quiet" to={quietTo}>{status.text}</Link>
          ) : attentionCard || !alerts.length ? (
            <a className="status-line" href={alerts.length ? '#w-attention' : quietTo} onClick={(e) => {
              if (!alerts.length) return;
              e.preventDefault();
              document.getElementById('w-attention')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            }}>{status.text}</a>
          ) : (
            <h2 className="status-line">{status.text}</h2>
          )}
          {!attentionCard && <HeaderAlerts alerts={snap!.alerts} now={now} />}
          <Overnight now={now} />
        </div>
      </div>}
      {homeServer === 'card' ? <div className="header-board-vitals"><Vitals compact /></div>
        : homeServer !== 'hidden' && <HeaderServer storage={homeServer === 'full'} />}
      <div className="header-context">
        {homeClockSize !== 'hidden' && (
          <div className="masthead-time">
            <span className="clock">{time}{meridiem && <small>{meridiem}</small>}</span>
            <Link to="/upcoming" className="date" title="What's coming this week">{date}</Link>
          </div>
        )}
        {weather && !weatherOnBoard && homeWeather !== 'hidden' && (
          <Link to="/weather" className={`masthead-weather header-weather is-${homeWeather}`} title="Open the hourly forecast and weather alerts">
            <div className="header-weather-now">
              <span className="temp">{deg(weather.tempNow, unit)}°</span>
              <span className="weather-text">
                <strong>{weather.label}</strong>
                <span>{weatherText(weather.codeNow)}</span>
                <small>High {deg(weather.days[0]?.high ?? weather.tempNow, unit)}° · Low {deg(weather.days[0]?.low ?? weather.tempNow, unit)}°</small>
                {(weather.alerts ?? []).length > 0 && <span className="masthead-alert">{weather.alerts![0].event}</span>}
              </span>
            </div>
            {homeWeather !== 'current' && (homeWeather === 'hourly' && (weather.hours?.length ?? 0) > 1 ? (
              <HeaderWeatherChart weather={weather} clock24={clock24} unit={unit} />
            ) : (
              <ol className="header-forecast" aria-label="Next three days">
                {weather.days.slice(1, 4).map((w) => (
                  <li key={w.date}>
                    <span>{new Date(`${w.date}T12:00:00`).toLocaleDateString(locale(), { weekday: 'short' })}</span>
                    <strong>{deg(w.high, unit)}°</strong>
                    <span>{weatherText(w.code)}</span>
                  </li>
                ))}
              </ol>
            ))}
          </Link>
        )}
      </div>
    </header>
  );
}

/** The next twelve hours: temperature above the chance-of-rain bars. */
function HeaderWeatherChart({ weather, clock24, unit }: { weather: WeatherData; clock24: boolean; unit: 'f' | 'c' | 'both' }) {
  const hours = (weather.hours ?? []).slice(0, 12);
  const low = Math.min(...hours.map((h) => h.temp));
  const high = Math.max(...hours.map((h) => h.temp));
  const y = (v: number) => 29 - ((v - low) / Math.max(2, high - low)) * 24;
  const x = (i: number) => 4 + (i / Math.max(1, hours.length - 1)) * 192;
  const points = hours.map((h, i) => `${x(i)},${y(h.temp)}`).join(' ');
  const rain = Math.max(...hours.map((h) => h.precipPct));
  return (
    <span className="header-weather-chart">
      <span className="header-chart-caption"><span>Next {hours.length} hours · °{unit === 'c' ? 'C' : 'F'}</span><span>Rain {rain}%</span></span>
      <svg viewBox="0 0 200 50" preserveAspectRatio="none" role="img" aria-label={`Temperature ${deg(low, unit)} to ${deg(high, unit)} degrees. Chance of rain up to ${rain} percent.`}>
        {hours.map((h, i) => <rect key={h.time} className="header-rain" x={x(i) - 2} y={49 - h.precipPct * 0.16} width="4" height={Math.max(0.5, h.precipPct * 0.16)} />)}
        <polyline className="header-temperature" points={points} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="header-hour-labels">
        {hours.filter((_, i) => i === 0 || i === Math.floor(hours.length / 2) || i === hours.length - 1).map((h, i) => (
          <span key={h.time}><b>{deg(h.temp, unit)}°</b> {i === 0 ? t('Now') : new Date(h.time).toLocaleTimeString(locale(), { hour: 'numeric', hour12: !clock24 })}</span>
        ))}
      </span>
    </span>
  );
}

/**
 * Needs attention in the header: compact problem links under the status line,
 * worst first, each one a link to its fix. Three show; the rest open in place.
 */
function HeaderAlerts({ alerts, now }: { alerts: Alert[]; now: number }) {
  const [all, setAll] = useState(false);
  // On a phone the why stays folded, like a tooltip: tap a line without a link to read it.
  const [told, setTold] = useState<string | null>(null);
  // Arriving from Jump to's "All N that need you": open the rest straight away.
  const arrived = useLocation();
  useEffect(() => {
    if ((arrived.state as { attention?: boolean } | null)?.attention) setAll(true);
  }, [arrived.key]);
  const pop = useRef<HTMLUListElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  // Problems first, worst first; then quiet notes, like an app Patchboard
  // can't reach, in gray.
  const list = byUrgency(alerts);
  const SHOWN = 3;
  const hidden = list.slice(SHOWN);
  // The rest open in a panel over the page, so the board below never moves.
  // Escape or a click elsewhere closes it, and focus goes back to the link.
  useEffect(() => {
    if (!all) return;
    pop.current?.querySelector<HTMLElement>('a, [tabindex]')?.focus();
    const close = (back: boolean) => {
      setAll(false);
      if (back) opener.current?.focus();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(true);
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !opener.current?.contains(t)) close(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [all]);
  if (!list.length) return null;
  const notes = hidden.filter((a) => a.level === 'info').length;
  const problems = hidden.length - notes;
  const more = [problems && `${problems} more`, notes && plural(notes, 'note')].filter(Boolean).join(', ');
  const row = (a: Alert) => {
    const body = (
      <>
        <Led state={alertLed[a.level]} />
        <span className="head-alert-title">
          <WithSubject title={a.title} subject={a.subject} />
        </span>
        {a.since && <span className="head-alert-since">{agoLong(a.since, now)}</span>}
        {/* On touch screens, where the hover title can't be read, a tap shows it. */}
        {a.detail && told === a.id && <span className="head-alert-detail">{a.detail}</span>}
      </>
    );
    return (
      <li key={a.id} className={`head-alert alert-${a.level}`} title={a.detail}>
        {a.href ? (
          isExternal(a.href) ? (
            <a href={a.href} target="_blank" rel="noreferrer" aria-label={spoken(a, now)}>
              {body}
            </a>
          ) : (
            <Link to={a.href} aria-label={spoken(a, now)}>
              {body}
            </Link>
          )
        ) : a.detail ? (
          <button type="button" className="head-alert-tell" aria-expanded={told === a.id} aria-label={spoken(a, now)} onClick={() => setTold(told === a.id ? null : a.id)}>
            {body}
          </button>
        ) : (
          <span tabIndex={-1}>{body}</span>
        )}
      </li>
    );
  };
  return (
    <ul className="head-alerts" aria-label="Needs attention">
      {list.slice(0, SHOWN).map(row)}
      {hidden.length > 0 && (
        <li className="head-alert-more">
          <button ref={opener} type="button" className="text-button" aria-expanded={all} aria-controls="head-alert-rest" onClick={() => setAll(!all)}>
            {all ? 'Close' : more}
          </button>
          {all && (
            <ul ref={pop} id="head-alert-rest" className="head-alert-pop" aria-label="The rest that need you">
              {hidden.map(row)}
            </ul>
          )}
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
    return bad ? tn(bad, '{n} {what} backup failed', '{n} {what} backups failed', { what: noun }) : `${r.items.length} ${noun}`;
  };
  const parts = [part(db, db && db.items.length === 1 ? t('database') : t('databases')), part(files, t('file sets'))].filter(Boolean);
  const anyBad = [db, files].some((r) => fresh(r) && r!.items.some((i) => !i.ok));
  return (
    <Link to="/server#backups" className={`overnight ${anyBad ? 'is-bad' : ''}`}>
      {anyBad ? t('Overnight: ') : t('Backed up overnight: ')}
      {parts.join(', ')}.
    </Link>
  );
}

/**
 * Integrations Patchboard can't reach, as a sentence, or null. "All quiet"
 * would be a guess while one is down, so the quiet lines say this instead.
 */
function blindSpot(snap: NonNullable<ReturnType<typeof useStore>['snap']>): string | null {
  const down = snap.alerts.filter((a) => a.id.startsWith('src-')).map((a) => snap.sources[a.source as keyof typeof snap.sources]?.label ?? a.source);
  if (!down.length) return null;
  return down.length === 1 ? t("Can't reach {name}.", { name: down[0] }) : t("Can't reach {n} integrations.", { n: count(down.length) });
}

export function Attention({ alerts, now }: { alerts: Alert[]; now: number }) {
  const { snap } = useStore();
  const blind = snap ? blindSpot(snap) : null;
  const serious = needsYou(alerts).length;
  const clear = serious === 0 && (
    <div className="all-clear">
      <p>
        <strong>{blind ? 'Connection problem.' : 'Nothing needs you.'}</strong>
        <br />
        {blind ? blind : alerts.length ? `${alerts.length === 1 ? 'One note' : `${alerts.length} notes`} below, nothing urgent.` : 'Everything is running.'}
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
              <Led state={alertLed[a.level]} />
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
                  <a href={a.href} target="_blank" rel="noreferrer" aria-label={spoken(a, now)}>{body}</a>
                ) : (
                  <Link to={a.href} aria-label={spoken(a, now)}>{body}</Link>
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
  // No address (the demo's "#"): the messages are text, not links that go nowhere.
  const webmail = data?.webUrl && data.webUrl !== '#' ? data.webUrl : undefined;
  return (
    <Section
      title="Inbox"
      className="inbox"
      count={data ? (data.unread ? `${count(data.unread)} unread` : 'Nothing unread') : undefined}
      action={data && webmail ? { label: 'Open Fastmail', href: webmail } : undefined}
      source={state}
    >
      {data?.messages.length ? (
        <ul className="mail">
          {data.messages.slice(0, limit).map((m) => (
            <li key={m.id} className={m.unread ? 'is-unread' : undefined}>
              {webmail ? (
                <a href={webmail} target="_blank" rel="noreferrer" title={m.preview}>
                  <span className="mail-from">{m.from}</span>
                  <span className="mail-subject">{m.subject}</span>
                  <time className="mail-time">{ago(m.receivedAt, now)}</time>
                </a>
              ) : (
                <div title={m.preview}>
                  <span className="mail-from">{m.from}</span>
                  <span className="mail-subject">{m.subject}</span>
                  <time className="mail-time">{ago(m.receivedAt, now)}</time>
                </div>
              )}
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
      title="Reading"
      className="feeds-brief"
      count={data ? `${count(data.unread)} unread` : undefined}
      action={data?.unread ? { label: 'Open Reading', to: '/reading' } : undefined}
      source={state}
    >
      {data?.entries.length ? (
        <ul className="feedlist">
          {data.entries
            .filter((e) => !feedHidden(e))
            .slice(0, limit)
            .map((e) => (
            <li key={e.id}>
              <Link to={`/reading?e=${e.id}`} title={e.title}>
                <span className="feed-title">{e.title}</span>
                <span className="feed-meta">
                  <span title={e.feed}>{e.feed}</span>
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

/** What's playing and, unless the Downloads widget is on the board, what's downloading. */
export function NowPlaying({ downloads = true }: { downloads?: boolean }) {
  // Rows per server or client, so a busy evening doesn't push the board down.
  // Each heading already gives the full count.
  const { limit = 6 } = useWidget();
  /** Fit took every row: each service is its heading and one line of titles. */
  const compact = limit === 0;
  const { snap: nowSnap } = useStore();
  /** Audiobookshelf and Navidrome open in their app, as Plex and Jellyfin do, when it has an address. */
  const listenHref = (id: string) => {
    const h = nowSnap?.catalog.groups.flatMap((g) => g.services).find((x) => x.container === id || x.name.toLowerCase() === id)?.href;
    return h && isExternal(h) ? h : undefined;
  };
  const { servers, configured } = useMediaServers();
  const all = useDownloadClients();
  const clients = downloads ? all.clients : [];
  const anyClient = downloads && all.configured;
  const abs = useSource<ListeningData>('audiobookshelf');
  const navi = useSource<ListeningData>('navidrome');
  const listening = [
    { id: 'audiobookshelf', label: 'Audiobookshelf', data: abs.data },
    { id: 'navidrome', label: 'Navidrome', data: navi.data },
  ].filter((l) => l.data?.streams.length);
  if (!configured && !anyClient && !abs.state && !navi.state) return null;
  // Quiet servers share one line, and only while nothing plays anywhere:
  // with Plex busy, "nobody is watching Jellyfin" is noise.
  const watching = servers.filter((m) => m.data.streams.length);
  const idle = watching.length || listening.length ? [] : servers;
  const isQuiet = (d: (typeof clients)[number]) => !d.data.paused && !d.data.downloading && !d.data.errored.length;
  const quietClients = clients.filter(isQuiet);
  const seedingClients = quietClients.filter((d) => d.data.kind !== 'usenet' && d.data.seeding > 0);
  const idleClients = quietClients.filter((d) => !seedingClients.includes(d));
  const busyClients = clients.filter((d) => !isQuiet(d));

  return (
    <Section title="Right now" className="now">
      <div className="now-grid">
      {idle.length > 0 && (
        <div className="now-block">
          <h3 className="now-idle">
            <Led state="idle" />
            Nobody is watching{' '}
            {idle.map((m, i) => (
              <span key={m.id}>
                {i > 0 && (i === idle.length - 1 ? ' or ' : ', ')}
                <AppLink container={m.container}>{m.label}</AppLink>
              </span>
            ))}
            .
          </h3>
        </div>
      )}
      {watching.map((m) => (
        <div className="now-block" key={m.id}>
          <h3>
            <Led state="ok" />
            <AppLink container={m.container}>{`${plural(m.data.streams.length, 'stream')} on ${m.label}`}</AppLink>
          </h3>
          {/* Folded: the titles in a line, each still opening its details. */}
          {compact && (
            <p className="now-foot now-compact">
              {m.data.streams.map((s, i) => (
                <Fragment key={`${s.user}:${s.title}:${i}`}>
                  {i > 0 && ', '}
                  <StreamRow compact stream={s} service={m.id === 'tautulli' ? 'plex' : m.id === 'emby' ? 'emby' : 'jellyfin'} label={m.label} href={s.itemId ? itemHref(m, s.itemId) : m.href} />
                </Fragment>
              ))}
            </p>
          )}
          {m.data.streams.slice(0, limit).map((s, i) => (
            <StreamRow key={`${s.user}:${s.title}:${i}`} stream={s} service={m.id === 'tautulli' ? 'plex' : m.id === 'emby' ? 'emby' : 'jellyfin'} label={m.label} href={s.itemId ? itemHref(m, s.itemId) : m.href} />
          ))}
          {/* Fit or a small limit cut the list: say so, and lead to the rest. */}
          {!compact && m.data.streams.length > limit && (
            <p className="now-foot now-more">
              <AppLink container={m.container}>{m.data.streams.length - limit} more on {m.label}</AppLink>
            </p>
          )}
        </div>
      ))}

      {listening.map((l) => (
        <div className="now-block" key={l.id}>
          <h3>
            <Led state="ok" />
            <AppLink container={l.id}>{l.data!.streams.length === 1 ? '1 person' : `${l.data!.streams.length} people`} listening on {l.label}</AppLink>
          </h3>
          {compact && (
            <p className="now-foot now-compact">
              {l.data!.streams.map((s, i) => (
                <Fragment key={`${s.user}:${s.title}:${i}`}>
                  {i > 0 && ', '}
                  <StreamRow compact stream={s} service={l.id === 'audiobookshelf' ? 'audiobookshelf' : 'navidrome'} label={l.label} href={listenHref(l.id)} />
                </Fragment>
              ))}
            </p>
          )}
          {l.data!.streams.slice(0, limit).map((s, i) => (
            <StreamRow key={`${s.user}:${s.title}:${i}`} stream={s} service={l.id === 'audiobookshelf' ? 'audiobookshelf' : 'navidrome'} label={l.label} href={listenHref(l.id)} />
          ))}
        </div>
      ))}

      {quietClients.length > 0 && (
        <div className="now-block">
          {idleClients.length > 0 && (
            <h3 className="now-idle">
              <Led state="idle" />
              Nothing downloading in{' '}
              {idleClients.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && (i === idleClients.length - 1 ? ' or ' : ', ')}
                  <AppLink container={d.container}>{d.label}</AppLink>
                </span>
              ))}
              .
            </h3>
          )}
          {/* Seeding still uses the line, so its Pause stays; one line says both. */}
          {seedingClients.map((d) => (
            <p className="now-foot now-seed" key={d.id}>
              <span>
                <AppLink container={d.container}>{d.label}</AppLink> is seeding {d.data.seeding}
                {d.data.up ? ` at ${speed(d.data.up)}` : ''}
                {d.data.stalled ? `, ${d.data.stalled} stalled` : ''}, nothing downloading
              </span>
              <PauseButton client={d} />
            </p>
          ))}
        </div>
      )}
      {busyClients.map((d) => {
        return (
        <div className="now-block" key={d.id}>
          {/* The heading says what's happening; its Pause sits beside it, not inside it. */}
          <div className="now-head">
            <h3>
              <Led state={d.data.errored.length ? 'crit' : d.data.downloading && !d.data.paused ? 'ok' : 'idle'} />
              <AppLink container={d.container}>
                {d.data.paused
                  ? `${d.label} is paused`
                  : d.data.downloading
                    ? `Downloading ${d.data.downloading} in ${d.label} at ${speed(d.data.down)}`
                    : `Nothing downloading in ${d.label}`}
              </AppLink>
            </h3>
            <PauseButton client={d} />
          </div>
          {!d.data.paused &&
            d.data.active.slice(0, limit).map((t) => (
              <div className="stream" key={t.name}>
                <div className="stream-line">
                  <span className="stream-title torrent-name">{breakable(t.name)}</span>
                  <span className="stream-user">{t.speed ? eta(t.etaSec) || speed(t.speed) : 'Queued'}</span>
                </div>
                <Meter label={`${t.name} download progress`} value={t.progress * 100} level="ok" />
              </div>
            ))}
          {!compact && !d.data.paused && d.data.active.length > limit && (
            <p className="now-foot now-more">
              <AppLink container={d.container}>{d.data.active.length - limit} more in {d.label}</AppLink>
            </p>
          )}
          {!compact && d.data.kind !== 'usenet' && !d.data.paused && (
            <p className="now-foot">
              Seeding {d.data.seeding}, uploading at {speed(d.data.up)}
              {d.data.stalled ? `. ${d.data.stalled} stalled` : ''}.
            </p>
          )}
          {d.data.errored.length > 0 && <p className="now-foot crit-text">{plural(d.data.errored.length, 'download')} failed: {d.data.errored.slice(0, 2).join(', ')}</p>}
        </div>
        );
      })}
      </div>
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
    <Section title={days > 7 ? 'Next two weeks' : 'This week'} className="upcoming-brief" count={week.length ? plural(groupDrops(week).length, 'release') : undefined} action={{ label: 'All upcoming', to: '/upcoming' }}>
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
  const { snap } = useStore();
  const [search, setSearch] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  // Out and still missing: Sonarr or Radarr can go and look for it.
  const missing = !it.hasFile && it.searchId != null && it.source !== 'trakt' && Date.parse(it.when) <= Date.now();
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
    <li className={`rel ${it.hasFile ? 'has-file' : ''} ${art ? 'with-art' : ''} ${missing ? 'is-missing' : ''}`}>
      {it.url && it.url !== '#' ? (
        <a href={it.url} target="_blank" rel="noreferrer" aria-label={`${[it.title, it.subtitle].filter(Boolean).join(', ')}${time ? `, ${time}` : ''}${it.hasFile ? ', downloaded' : ''}, open in ${sourceName[it.source]}`}>
          {content}
        </a>
      ) : (
        <div>{content}</div>
      )}
      {/* Sent: a plain, settled note in the same spot, said once to a screen reader. */}
      {missing && !snap?.readOnly && search === 'sent' && (
        <span className="rel-search rel-sent" role="status">
          Search sent
        </span>
      )}
      {missing && !snap?.readOnly && search !== 'sent' && (
        <button
          type="button"
          className="text-button rel-search"
          disabled={search === 'busy'}
          title={`Ask ${sourceName[it.source]} to search for it now`}
          aria-label={`Search for ${it.title}${it.subtitle ? ` ${it.subtitle}` : ''}`}
          onClick={async () => {
            setSearch('busy');
            const res = await fetch(`/api/arr/${it.source}/search/${it.searchId}`, { method: 'POST', headers: { 'X-Patchboard': 'action' } }).catch(() => null);
            setSearch(res?.ok ? 'sent' : 'failed');
          }}
        >
          {search === 'busy' ? 'Searching' : search === 'failed' ? 'Try again' : 'Search'}
        </button>
      )}
    </li>
  );
}

const sourceName = { sonarr: 'Sonarr', radarr: 'Radarr', trakt: 'Trakt' };

/** An alert as one spoken sentence: its parts sit side by side on screen, so a reader needs the pauses. */
function spoken(a: Alert, now: number): string {
  return [a.title, a.since ? agoLong(a.since, now) : '', a.detail ?? ''].filter(Boolean).join('. ');
}

/** An alert wears the status light: red down, amber trouble, a dark socket for a note. */
const alertLed = { critical: 'crit', warn: 'warn', info: 'idle' } as const;

const changeText: Record<ChangeEvent['kind'], string> = {
  'container.stopped': 'stopped',
  'container.started': 'started',
  'container.restarted': 'restarted',
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
  const { snap } = useStore();
  const { limit = 6 } = useWidget();
  if (!changes.length) return null;
  // A stop stays red only while it's still unexplained: not running again,
  // not a job that runs on a schedule, not stopped on purpose from here.
  const over = (name: string) => {
    const ctr = containerMap(snap).get(name);
    return !ctr || ctrState(ctr, serviceFor(snap, name)) !== 'down';
  };
  return (
    <Section title="Changes" className="changes-sec" count="last 48 hours">
      <ul className="changes">
        {changes.slice(0, limit).map((c) => (
          <li key={c.id} className={`change change-${c.kind.split('.')[1]} ${c.kind === 'container.stopped' && over(c.subject) ? 'is-over' : ''}`}>
            <Link to={`/c/${c.subject}`}>
              <span className="change-text">
                <Ident>{c.subject}</Ident> {c.kind === 'container.action' ? (actionText[c.detail ?? ''] ?? changeText[c.kind]) : c.kind === 'container.restarted' && c.detail === 'updated' ? 'updated' : changeText[c.kind]}
              </span>
              <time>{ago(c.at, now)}</time>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * On a wide screen a shelf shows exactly the posters that fit one row, so it
 * never scrolls or cuts the last one in half; the widget's limit caps it. A
 * shelf with fewer than a row keeps its posters at their own size. On a phone
 * it's a shelf to swipe, up to the limit.
 */
function useShelf(items: MergedItem[], limit: number) {
  const [fit, setFit] = useState<number | null>(null);
  const shelf = useRef<HTMLDivElement>(null);
  const hasItems = items.length > 0;
  useEffect(() => {
    const el = shelf.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width / (parseFloat(getComputedStyle(document.body).zoom) || 1);
      // A poster column and its gap, as the stylesheet sets them.
      const col = parseFloat(getComputedStyle(el.querySelector('.posters') ?? el).getPropertyValue('--poster-w')) || 138;
      setFit(window.innerWidth > 760 ? Math.max(1, Math.floor((w + 20) / (col + 20))) : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasItems]);
  const shown = items.slice(0, fit ? Math.min(fit, limit) : limit);
  return { shelf, shown, fit: !!fit && shown.length === fit };
}

/** Newest first, one copy of each. */
export function RecentlyAdded({ now }: { now: number }) {
  const { servers } = useMediaServers();
  const { limit = 24 } = useWidget();
  const items = mergeRecent(servers);
  const { shelf, shown, fit } = useShelf(items, limit);
  if (!items.length) return null;
  const title = servers.length === 1 ? `Recently added to ${servers[0].label}` : 'Recently added';
  return (
    <Section title={title} className="recent">
      <div ref={shelf} className="shelf-measure">
        <PosterShelf items={shown} now={now} showServer={servers.length > 1} fit={fit} />
      </div>
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
  const { shelf, shown, fit } = useShelf(items, limit);
  if (!items.length) return null;
  return (
    <Section title="Next up" className="recent">
      <div ref={shelf} className="shelf-measure">
        <PosterShelf items={shown} showServer={servers.length > 1} fit={fit} />
      </div>
    </Section>
  );
}

function PosterShelf({ items, now, showServer, fit }: { items: MergedItem[]; now?: number; showServer: boolean; fit?: boolean }) {
  const { snap } = useStore();
  // The demo's apps have no address: its posters open the title on TMDB, as its release rows do.
  const hrefOf = (r: MergedItem) => itemHref(r.server, r.id) ?? (snap?.demo ? `https://www.themoviedb.org/search?query=${encodeURIComponent(r.title)}` : undefined);
  // A poster with nowhere to go is a picture, not a dead link; the shelf says once how to make them open.
  const nowhere = [...new Set(items.filter((r) => !hrefOf(r)).map((r) => r.server.label))];
  return (
    <>
      <ul className={`posters ${fit ? 'is-fit' : ''}`}>
        {items.map((r) => {
          const href = hrefOf(r);
          const inner = (
            <>
              <Poster title={r.title} thumb={r.thumb} />
              <span className="poster-title">{r.title}</span>
              <span className="poster-sub">
                {r.subtitle && <Episode text={r.subtitle} />}
                {now !== undefined && <time>{ago(r.addedAt, now)}</time>}
                {showServer && <span className="poster-src">{(r.servers ?? [r.server]).map((s) => s.label).join(' + ')}</span>}
              </span>
            </>
          );
          return (
            <li key={`${r.server.id}:${r.id}:${r.subtitle ?? ''}`}>
              {href ? (
                <a className="poster-link" href={href} target="_blank" rel="noreferrer" title={`Open in ${r.server.label}`}>
                  {inner}
                </a>
              ) : (
                <div className="poster-link is-plain">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
      {nowhere.length > 0 && (
        <p className="settings-note poster-hint">
          Give {nowhere.join(' and ')} an address in <Link to="/apps">Edit apps</Link> and these open there.
        </p>
      )}
    </>
  );
}

/**
 * A season dropped at once becomes one row: "Season 2, episodes 1 to 8".
 * Only episodes of one show and season, on one day, from one source.
 */
export function groupDrops(list: ReleaseItem[]): ReleaseItem[] {
  const ep = (it: ReleaseItem) => /^S(\d+)E(\d+)/.exec(it.subtitle ?? '');
  const day = (it: ReleaseItem) => new Date(it.when).toDateString();
  // Collect each show-season-day-source run first, wherever its episodes sit
  // in the list, then write one row per run at its first episode's place.
  const runs = new Map<string, { first: ReleaseItem; eps: number[]; season: number }>();
  const out: (ReleaseItem | string)[] = [];
  for (const it of list) {
    const m = ep(it);
    if (it.kind !== 'episode' || !m) {
      out.push(it);
      continue;
    }
    const key = [it.title, it.source, m[1], day(it)].join('|');
    const run = runs.get(key);
    if (run) run.eps.push(Number(m[2]));
    else {
      runs.set(key, { first: it, eps: [Number(m[2])], season: Number(m[1]) });
      out.push(key);
    }
  }
  return out.map((x) => {
    if (typeof x !== 'string') return x;
    const r = runs.get(x)!;
    if (r.eps.length === 1) return r.first;
    const lo = Math.min(...r.eps);
    const hi = Math.max(...r.eps);
    return { ...r.first, subtitle: lo === 1 ? `Season ${r.season}, episodes 1 to ${hi}` : `Season ${r.season}, episodes ${lo} to ${hi}` };
  });
}

/** A link to an app's container page, or plain text when no container here runs it. */
function AppLink({ container, children }: { container?: string; children: ReactNode }) {
  return container ? <Link to={`/c/${container}`}>{children}</Link> : <>{children}</>;
}

/** Sources every install has; anything else is an integration someone connected. */
const BUILT_IN = new Set(['docker', 'stats', 'system', 'checks']);

/**
 * First run: the containers already running, added as apps in one click;
 * then integrations; then the layout and the look. Stays until apps are in
 * and one integration is connected, or until hidden.
 */
function Welcome() {
  const { snap } = useStore();
  // A fresh install: hardly any apps (a label or two) and nothing arranged yet.
  const count = snap?.catalog.groups.reduce((n, g) => n + g.services.length, 0) ?? 0;
  const appsDone = count >= 5 || !!snap?.catalog.ordered;
  const connected = Object.keys(snap?.sources ?? {}).filter((id) => !BUILT_IN.has(id)).length;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('pb-welcome-hidden') === '1';
    } catch {
      return false;
    }
  });
  const none = !!snap && !dismissed && (!appsDone || connected === 0);
  const audit = useJson<CatalogAudit>(none && !appsDone ? '/api/catalog/audit' : null, 60_000);
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
        <h2>Welcome to Patchboard.</h2>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem('pb-welcome-hidden', '1');
            } catch {
              /* fine: it comes back next time */
            }
          }}
        >
          Hide this
        </button>
      </header>
      <ol className="welcome-steps">
        <li>
          <strong>Your apps.</strong>{' '}
          {appsDone ? (
            <span>
              {count} on Home. <Link to="/apps?arrange=1">Edit apps</Link> adds, groups and renames them.
            </span>
          ) : !docker?.ok ? (
            <span>
              Patchboard can't see Docker yet. Mount <code>/var/run/docker.sock</code> (read-only is fine) or set <code>DOCKER_HOST</code>, then reload.
            </span>
          ) : found.length ? (
            <span>
              {found.length} of your {containerMap(snap).size} containers look like apps you open; databases and helpers are left out.{' '}
              {!snap.readOnly && (
                <>
                  <button type="button" className="button board-save" disabled={busy} onClick={() => void addAll()}>
                    {busy ? 'Adding...' : `Add all ${found.length}, grouped by stack`}
                  </button>{' '}
                  or <Link to="/apps?arrange=1">pick them one by one</Link>.
                </>
              )}
            </span>
          ) : audit.data ? (
            <span>
              No other containers are running yet. Start some, or add an app by hand in <Link to="/apps?arrange=1">Edit apps</Link>.
            </span>
          ) : (
            <span>Looking for running containers...</span>
          )}
          {err && <span className="crit-text"> {err}</span>}
        </li>
        <li className="welcome-name">
          <strong>Name it.</strong> What the header and the tab call it. Leave it empty for Patchboard.
          <NameForm />
        </li>
        <li>
          <strong>Integrations.</strong>{' '}
          {connected ? (
            <span>{connected === 1 ? 'One connected' : `${connected} connected`}. More in <Link to="/settings?tab=connections">Settings, Connections</Link>.</span>
          ) : (
            <span>
              Connect Plex, Sonarr, your NAS and the rest in <Link to="/settings?tab=connections">Settings, Connections</Link>: an address and a key each. Their numbers
              and problems show up here.
            </span>
          )}
        </li>
        <li>
          <strong>Home.</strong> Start from a layout:{' '}
          {STARTERS.filter((st) => !st.wall).map((st, i) => (
            <span key={st.id}>
              {i > 0 && ', '}
              <button
                type="button"
                className="text-button in-sentence"
                title={st.about}
                onClick={async () => {
                  await fetch(`/api/boards/${HOME_ID}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(forThisServer(st.board, snap)) });
                  location.reload();
                }}
              >
                {st.name}
              </button>
            </span>
          ))}
          . Arrange board, at the foot of the board, changes any of it, and New board adds another.
        </li>
        <li>
          <strong>Your look.</strong> <Link to="/settings">Settings</Link> has themes, accent colors, type and density.
        </li>
      </ol>
      <p className="settings-note">
        Coming from Homepage? <Link to="/settings?tab=connections&import=homepage">Import its services.yaml</Link> in Settings.
      </p>
    </section>
  );
}
