// Media: Plex, Jellyfin and Emby. Who's watching, with Stop, and every
// library with Scan. Streams are the ones Home's Right now shows, so the two
// always agree; libraries are read from the servers while the page is open.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConnectOne } from '../components/ConnectOne.tsx';
import { PAGE_SOURCES } from '../../shared/feeds.ts';
import type { LibraryDetail, MediaLibraries, MediaLibrary, Stream } from '../../shared/types.ts';
import { HoldButton } from '../components/Hold.tsx';
import { Ago, Empty, Episode, Meter, Poster, PosterRow as Row } from '../components/ui.tsx';
import { agoLong, eta } from '../lib/format.ts';
import { msg, tn, t as tr } from '../lib/i18n.ts';
import { ACTION, call, useList } from '../lib/live-list.ts';
import { itemHref, type MediaServer, streamProps, useMediaServers } from '../lib/media.ts';
import { StreamRow } from '../components/StreamRow.tsx';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

type View = 'watching' | 'libraries';
const VIEWS: [View, string][] = [
  ['watching', msg('Watching')],
  ['libraries', msg('Libraries')],
];
// The Media page's server ids: Plex reports through Tautulli.
const SERVER_ID: Record<string, 'plex' | 'jellyfin' | 'emby'> = { tautulli: 'plex', jellyfin: 'jellyfin', emby: 'emby' };

export function Media() {
  const { snap } = useStore();
  const ro = !!snap?.readOnly;
  const { servers, configured } = useMediaServers();
  const [view, setView] = useUrlChoice<View>('view', VIEWS.map((v) => v[0]), 'watching');
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setSaid('');
    setErr('');
  }, [view]);

  if (!snap) return <div className="page media-page" aria-busy="true" />;
  if (!configured)
    return (
      <div className="page media-page">
        <div className="page-head">
          <h1 className="page-title">{tr('Media')}</h1>
        </div>
        <Empty>
          {tr('Plex, Jellyfin and Emby are not set up.')} <ConnectOne sources={PAGE_SOURCES['/media']} />
        </Empty>
      </div>
    );
  const streams = servers.flatMap((server) => server.data.streams.map((s) => ({ s, server })));

  return (
    <div className="page media-page">
      <div className="page-head">
        <h1 className="page-title">{tr('Media')}</h1>
      </div>
      <div className="page-toolbar">
        <div className="seg lib-views" role="group" aria-label={tr('Show')}>
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {tr(label)}
              {v === 'watching' && streams.length > 0 && <span className="dlp-count">{streams.length}</span>}
            </button>
          ))}
        </div>
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
      {view === 'watching' && <Watching streams={streams} many={servers.length > 1} ro={ro} onSaid={setSaid} onErr={setErr} />}
      {view === 'libraries' && <Libraries ro={ro} onSaid={setSaid} onErr={setErr} />}
    </div>
  );
}

function Watching({ streams, many, ro, onSaid, onErr }: { streams: { s: Stream; server: MediaServer }[]; many: boolean; ro: boolean; onSaid: (s: string) => void; onErr: (s: string) => void }) {
  const [busy, setBusy] = useState('');
  if (!streams.length) return <Empty>{tr('Nobody is watching.')}</Empty>;

  async function stop(s: Stream, server: MediaServer) {
    setBusy(s.session!);
    onSaid('');
    onErr('');
    try {
      await call(`/api/media/${SERVER_ID[server.id]}/stop/${encodeURIComponent(s.session!)}`, { method: 'POST', headers: ACTION });
      onSaid(tr('Stopped {title} for {user}.', { title: s.title, user: s.user }));
    } catch (e) {
      onErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <ul className="lib-list">
      {streams.map(({ s, server }) => (
        <Row
          key={`${server.id}:${s.session ?? s.user + s.title}`}
          art={s.thumb}
          title={s.title}
          actions={
            !ro &&
            s.session && (
              <HoldButton className="text-button" danger disabled={busy === s.session} label={tr('Stop {title} for {user}', { title: s.title, user: s.user })} hint={tr('Hold to stop it. They see a note that you did.')} onConfirm={() => void stop(s, server)}>
                {tr('Stop')}
              </HoldButton>
            )
          }
        >
          <span className="lib-title">
            <StreamRow compact stream={s} {...streamProps(server, s)} />
            {s.subtitle && <span className="lib-year"> {s.subtitle}</span>}
          </span>
          <div className="dlp-meta">
            <span>{s.user}</span>
            {s.device && <span>{s.device}</span>}
            {many && <span>{server.label}</span>}
            <span>{s.transcode ? tr('Transcoding') : tr('Direct play')}</span>
            {s.state !== 'playing' && <span>{s.state === 'paused' ? tr('Paused') : tr('Buffering')}</span>}
          </div>
          {s.progress >= 0 && (
            <div className="media-progress playback" data-service={streamProps(server, s).service}>
              <Meter value={s.progress} level="ok" label={tr('{title}, {pct}% played', { title: s.title, pct: Math.round(s.progress) })} />
              {s.durationSec != null && s.positionSec != null && <span className="lib-total">{eta(s.durationSec - s.positionSec)}</span>}
            </div>
          )}
        </Row>
      ))}
    </ul>
  );
}

const KIND_COUNT: Record<MediaLibrary['kind'], string> = {
  movies: msg('{n} films'),
  shows: msg('{n} shows'),
  music: msg('{n} albums'),
  photos: msg('{n} items'),
  other: msg('{n} items'),
};

const SOURCE: Record<MediaLibrary['server'], string> = { plex: 'tautulli', jellyfin: 'jellyfin', emby: 'emby' };

/** One library opened: how much it holds, where it reads from, and what came in last. */
function LibraryPanel({ library: l }: { library: MediaLibrary }) {
  const { data, err } = useList<LibraryDetail>(`/api/media/${l.server}/library/${encodeURIComponent(l.id)}`);
  const { servers } = useMediaServers();
  const server = servers.find((s) => s.id === SOURCE[l.server]);
  if (err) return <p className="crit-text lib-panel">{err}</p>;
  if (!data) return <div className="dlp-loading lib-panel" aria-busy="true" />;
  return (
    <div className="lib-panel media-lib">
      {(data.episodes != null || data.tracks != null || data.folders.length > 0) && (
        <div className="dlp-meta">
          {data.episodes != null && <span>{tr('{n} episodes', { n: data.episodes.toLocaleString() })}</span>}
          {data.tracks != null && <span>{tr('{n} tracks', { n: data.tracks.toLocaleString() })}</span>}
          {data.folders.map((f) => (
            <span key={f} className="media-lib-folder">
              {f}
            </span>
          ))}
        </div>
      )}
      {data.recent.length === 0 ? (
        <p className="lib-total">{tr('Nothing added yet.')}</p>
      ) : (
        <ul className="posters media-lib-posters" aria-label={tr('Added lately')}>
          {data.recent.map((r) => {
            const href = server && itemHref(server, r.id);
            const inner = (
              <>
                <Poster title={r.title} thumb={r.thumb} />
                <span className="poster-title">{r.title}</span>
                <span className="poster-sub">
                  {r.episodes ? tn(r.episodes, '{n} new episode', '{n} new episodes') : r.subtitle && <Episode text={r.subtitle} />}
                  <Ago at={r.addedAt} />
                </span>
              </>
            );
            return (
              <li key={`${r.id}:${r.subtitle ?? ''}`}>
                {href ? (
                  <a className="poster-link" href={href} target="_blank" rel="noreferrer">
                    {inner}
                  </a>
                ) : (
                  <div className="poster-link is-plain">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Libraries({ ro, onSaid, onErr }: { ro: boolean; onSaid: (s: string) => void; onErr: (s: string) => void }) {
  const { data, err, reload } = useList<MediaLibraries>('/api/media/libraries');
  const [opened, setOpened] = useState('');
  const scanning = data?.servers.some((s) => s.libraries.some((l) => l.scanning));
  // While a scan runs, look again every few seconds to see it finish.
  useEffect(() => {
    if (!scanning) return;
    const t = setTimeout(reload, 4000);
    return () => clearTimeout(t);
  }, [scanning, data, reload]);

  async function scan(l: MediaLibrary) {
    onSaid('');
    onErr('');
    try {
      await call(`/api/media/${l.server}/scan/${encodeURIComponent(l.id)}`, { method: 'POST', headers: ACTION });
      onSaid(tr('Scanning {name}.', { name: l.name }));
      setTimeout(reload, 800);
    } catch (e) {
      onErr((e as Error).message);
    }
  }

  if (err) return <p className="crit-text">{err}</p>;
  if (!data) return <div className="dlp-loading" aria-busy="true" />;
  return (
    <>
      {data.servers.map((server) => (
        <section key={server.id} className="media-server">
          {data.servers.length > 1 && <h2 className="media-server-name">{server.name}</h2>}
          {server.error && <p className="crit-text">{server.error}</p>}
          {!server.canScan && !ro && (
            <p className="lib-total">
              {tr('To scan from here, add Plex’s address and token.')} <Link to="/settings?tab=connections&setup=plex">{tr('Connect Plex')}</Link>
            </p>
          )}
          {!server.error && server.libraries.length === 0 ? (
            <Empty>{tr('No libraries.')}</Empty>
          ) : (
            <ul className="lib-list">
              {server.libraries.map((l) => {
                const key = `${l.server}:${l.id}`;
                return (
                <li key={l.id} className="lib-row no-art">
                  <div className="lib-body">
                    <span className="lib-title">{l.name}</span>
                    <div className="dlp-meta">
                      {l.count != null && <span>{tr(KIND_COUNT[l.kind], { n: l.count.toLocaleString() })}</span>}
                      {l.scanning ? <span className="media-scanning">{tr('Scanning')}</span> : l.scannedAt ? <span>{tr('scanned {when}', { when: agoLong(l.scannedAt) })}</span> : null}
                    </div>
                    {server.canOpen && (
                      <button type="button" className="text-button lib-open" aria-expanded={opened === key} onClick={() => setOpened(opened === key ? '' : key)}>
                        {opened === key ? tr('Hide') : tr('What’s in it')}
                      </button>
                    )}
                  </div>
                  {!ro && l.canScan && (
                    <div className="lib-actions">
                      <button type="button" className="button button-quiet" disabled={l.scanning} onClick={() => void scan(l)}>
                        {tr('Scan')}
                      </button>
                    </div>
                  )}
                  {opened === key && (
                    <div className="lib-below">
                      <LibraryPanel library={l} />
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
