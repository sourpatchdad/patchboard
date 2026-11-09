// What was watched and what's being listened to: history across the media
// servers, books in progress and albums played lately. Right now shows what's
// playing this minute; these show what happened and what's half done.

import type { ListeningData } from '../../shared/types.ts';
import { Empty, Meter, Section } from '../components/ui.tsx';
import { agoLong } from '../lib/format.ts';
import { itemHref, useMediaServers } from '../lib/media.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { useWidget } from './widget-context.ts';

/** An app's address from your catalog, by name. */
function appHref(snap: ReturnType<typeof useStore>['snap'], name: string): string | undefined {
  const app = snap?.catalog.groups.flatMap((g) => g.services).find((s) => s.name.toLowerCase() === name.toLowerCase());
  return app?.href && app.href !== '#' ? app.href.replace(/\/+$/, '') : undefined;
}

export function WatchedWidget({ now }: { now: number }) {
  const { servers, configured } = useMediaServers();
  const { limit = 8 } = useWidget();
  if (!configured) return null;
  const plays = servers
    .flatMap((server) => (server.data.watched ?? []).map((p) => ({ ...p, server })))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
  const today = plays.filter((p) => now - p.at < 86_400_000).length;
  return (
    <Section title="Watched" count={today ? `${today} today` : undefined} className="watched">
      {plays.length === 0 ? (
        <Empty>Nothing watched lately.</Empty>
      ) : (
        <ul className="play-list">
          {plays.map((p) => {
            const href = p.itemId ? itemHref(p.server, p.itemId) : p.server.href;
            const body = (
              <>
                <span className="play-main">
                  <span className="play-title">{p.title}</span>
                  {p.subtitle && <span className="play-sub">{p.subtitle}</span>}
                </span>
                <span className="play-meta">
                  {p.user}, {agoLong(p.at, now)}
                  {servers.length > 1 ? `, ${p.server.label}` : ''}
                </span>
              </>
            );
            return (
              <li key={`${p.server.id}:${p.itemId ?? p.title}:${p.at}`}>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="play">
                    {body}
                  </a>
                ) : (
                  <div className="play">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

export function ListeningWidget({ now }: { now: number }) {
  const { snap } = useStore();
  const abs = useSource<ListeningData>('audiobookshelf');
  const navi = useSource<ListeningData>('navidrome');
  const { limit = 6 } = useWidget();
  if (!abs.state && !navi.state) return null;
  const books = (abs.data?.inProgress ?? []).slice(0, limit);
  const albums = (navi.data?.albums ?? []).slice(0, limit);
  const both = !!abs.state && !!navi.state;
  const absHref = appHref(snap, 'Audiobookshelf');
  return (
    <Section title="Listening" className="listening">
      {!books.length && !albums.length && <Empty>Nothing in progress.</Empty>}
      {books.length > 0 && (
        <>
          {both && <h3 className="listen-sub">Books in progress</h3>}
          <ul className="play-list">
            {books.map((b) => {
              const body = (
                <>
                  <span className="play-main">
                    <span className="play-title">{b.title}</span>
                    {b.author && <span className="play-sub">{b.author}</span>}
                  </span>
                  <span className="play-meta">
                    {Math.round(b.progress * 100)}%, {agoLong(b.at, now)}
                  </span>
                  <Meter value={b.progress * 100} label={`${b.title}, ${Math.round(b.progress * 100)}%`} />
                </>
              );
              return (
                <li key={b.id}>
                  {absHref ? (
                    <a href={`${absHref}/item/${encodeURIComponent(b.id)}`} target="_blank" rel="noreferrer" className="play has-meter">
                      {body}
                    </a>
                  ) : (
                    <div className="play has-meter">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {albums.length > 0 && (
        <>
          {both && <h3 className="listen-sub">Albums played lately</h3>}
          <ul className="play-list">
            {albums.map((a) => (
              <li key={`${a.title}:${a.artist ?? ''}`}>
                <div className="play">
                  <span className="play-main">
                    <span className="play-title">{a.title}</span>
                    {a.artist && <span className="play-sub">{a.artist}</span>}
                  </span>
                  {a.at && <span className="play-meta">{agoLong(a.at, now)}</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
