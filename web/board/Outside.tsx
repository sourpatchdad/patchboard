// Widgets that need no integration: bookmarks, a search box, clocks for
// other places, any RSS or Atom feeds, and GitHub releases. Feeds and
// releases come through the server, which reads the addresses saved in the
// board; the browser names only the board and the widget.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FeedItem, ReleaseInfo } from '../../shared/types.ts';
import { searchUrl } from '../../shared/fields.ts';
import { Empty, Icon, Section } from '../components/ui.tsx';
import { agoLong } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';
import { SetupLink } from './SetupLink.tsx';
import { useWidget } from './widget-context.ts';

export function BookmarksWidget() {
  const { snap } = useStore();
  const dock = snap?.catalog.dock ?? [];
  return (
    <Section title="Bookmarks" action={snap?.readOnly ? undefined : { label: 'Edit', to: '/apps?arrange=1' }} className="bookmarks">
      {dock.length === 0 ? (
        <Empty>
          No bookmarks yet. <Link to="/apps?arrange=1">Edit apps</Link> adds them, or brings them over from Homepage.
        </Empty>
      ) : (
        <ul className="bm-list">
          {dock.map((b) => (
            <li key={`${b.name}:${b.href}`}>
              <a href={b.href} target="_blank" rel="noreferrer" className="bm">
                <Icon name={b.name} icon={b.icon} size={18} />
                <span>{b.name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function SearchWidget({ config }: { config?: Record<string, string> }) {
  const [words, setWords] = useState('');
  return (
    <form
      className="search-widget"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!words.trim()) return;
        window.open(searchUrl(config, words.trim()), '_blank', 'noopener');
        setWords('');
      }}
    >
      <input className="field" type="search" value={words} onChange={(e) => setWords(e.target.value)} placeholder="Search the web" aria-label="Search the web" enterKeyHint="search" />
    </form>
  );
}

/** "Mum=Europe/London" or "Asia/Tokyo" as a label and a zone. */
const place = (line: string) => {
  const [label, zone] = line.includes('=') ? line.split('=', 2) : [line.split('/').pop()!.replace(/_/g, ' '), line];
  return { label: label.trim(), zone: zone.trim() };
};

export function ClocksWidget({ config, now }: { config?: Record<string, string>; now: number }) {
  const places = (config?.zones ?? '').split('\n').filter(Boolean).map(place);
  const here = new Date(now).toLocaleDateString('en-CA');
  return (
    <Section title="Clocks" className="clocks">
      {places.length === 0 ? (
        <Empty>
          No places yet. <SetupLink>Add places</SetupLink>
        </Empty>
      ) : (
        <ul className="clock-list">
          {places.map((p) => {
            const day = new Date(now).toLocaleDateString('en-CA', { timeZone: p.zone });
            return (
              <li key={p.label + p.zone}>
                <span className="clock-place">{p.label}</span>
                <span className="clock-time">{new Date(now).toLocaleTimeString(undefined, { timeZone: p.zone, hour: 'numeric', minute: '2-digit' })}</span>
                <span className="clock-day">{day === here ? '' : new Date(now).toLocaleDateString(undefined, { timeZone: p.zone, weekday: 'short' })}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** A widget's server-side data, refetched every few minutes. */
function useWidgetData<T>(path: string, ms: number): { data: T | null; failed: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch(path)
        .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject()))
        .then((d) => !gone && (setData(d), setFailed(false)))
        .catch(() => !gone && setFailed(true));
    void load();
    const t = setInterval(load, ms);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, [path, ms]);
  return { data, failed };
}

export function RssWidget({ board, id, config, now }: { board: string; id: string; config?: Record<string, string>; now: number }) {
  const { limit = 8 } = useWidget();
  const feeds = (config?.feeds ?? '').split('\n').filter(Boolean);
  const { data } = useWidgetData<{ items: FeedItem[]; failed: string[] }>(`/api/rss/${encodeURIComponent(board)}/${encodeURIComponent(id)}`, 5 * 60_000);
  return (
    <Section title="Feeds" className="rss">
      {feeds.length === 0 ? (
        <Empty>
          No feeds yet. <SetupLink>Add feed addresses</SetupLink>
        </Empty>
      ) : !data ? null : (
        <>
          {data.items.length === 0 && <Empty>Nothing new in these feeds.</Empty>}
          <ul className="play-list">
            {data.items.slice(0, limit).map((i) => (
              <li key={`${i.source}:${i.title}:${i.at}`}>
                <a href={i.link} target="_blank" rel="noreferrer" className="play">
                  <span className="play-main">
                    <span className="play-title">{i.title}</span>
                  </span>
                  <span className="play-meta">
                    {feeds.length > 1 ? `${i.source}, ` : ''}
                    {i.at ? agoLong(i.at, now) : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
          {data.failed.length > 0 && <p className="warn-text rss-failed">Couldn't read {data.failed.join(', ')}.</p>}
        </>
      )}
    </Section>
  );
}

export function ReleasesWidget({ board, id, config, now }: { board: string; id: string; config?: Record<string, string>; now: number }) {
  const { limit = 8 } = useWidget();
  const repos = (config?.repos ?? '').split('\n').filter(Boolean);
  const { data } = useWidgetData<{ releases: ReleaseInfo[] }>(`/api/releases/${encodeURIComponent(board)}/${encodeURIComponent(id)}`, 30 * 60_000);
  return (
    <Section title="Releases" className="releases">
      {repos.length === 0 ? (
        <Empty>
          No projects yet. <SetupLink>Add GitHub projects</SetupLink>
        </Empty>
      ) : !data ? null : (
        <ul className="play-list">
          {data.releases.slice(0, limit).map((r) => (
            <li key={r.repo}>
              <a href={r.url} target="_blank" rel="noreferrer" className="play">
                <span className="play-main">
                  <span className="play-title">{r.repo.split('/')[1]}</span>
                  <span className="play-sub mono">{r.none ? 'No releases' : r.version}</span>
                  {r.prerelease && <span className="play-sub">pre-release</span>}
                </span>
                <span className="play-meta">{r.at ? agoLong(r.at, now) : ''}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
