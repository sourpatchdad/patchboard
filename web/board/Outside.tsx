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
import { useWidgetData } from './widget-data.ts';
import { BigClock } from './Kiosk.tsx';
import { useAppearance } from '../lib/appearance.ts';
import { locale } from '../lib/region.ts';
import { t } from '../lib/i18n.ts';

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
  const { style } = useWidget();
  const zones = config?.zones ?? '';
  if (style === 'big') {
    return (
      <Section title="Clocks" className="clocks clocks-big">
        <BigClock now={now}>{zones && <ClockPlaces zones={zones} now={now} />}</BigClock>
      </Section>
    );
  }
  return (
    <Section title="Clocks" className="clocks">
      {zones ? (
        <ClockPlaces zones={zones} now={now} />
      ) : (
        <Empty>
          {t('No places yet.')} <SetupLink>{t('Add places')}</SetupLink>
        </Empty>
      )}
    </Section>
  );
}

/** The time in each place, with the day when it isn't today here. */
function ClockPlaces({ zones, now }: { zones: string; now: number }) {
  const { clock24 } = useAppearance();
  const places = zones.split('\n').filter(Boolean).map(place);
  const here = new Date(now).toLocaleDateString('en-CA');
  return (
    <ul className="clock-list">
      {places.map((p) => {
        const day = new Date(now).toLocaleDateString('en-CA', { timeZone: p.zone });
        return (
          <li key={p.label + p.zone}>
            <span className="clock-place">{p.label}</span>
            <span className="clock-time">{new Date(now).toLocaleTimeString(locale(), { timeZone: p.zone, hour: 'numeric', minute: '2-digit', hour12: !clock24 })}</span>
            <span className="clock-day">{day === here ? '' : new Date(now).toLocaleDateString(locale(), { timeZone: p.zone, weekday: 'short' })}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function RssWidget({ board, id, config, now }: { board: string; id: string; config?: Record<string, string>; now: number }) {
  const { limit = 8 } = useWidget();
  const feeds = (config?.feeds ?? '').split('\n').filter(Boolean);
  const { data } = useWidgetData<{ items: FeedItem[]; failed: string[]; unsaved?: boolean }>(`/api/rss/${encodeURIComponent(board)}/${encodeURIComponent(id)}`, 5 * 60_000, config?.feeds);
  return (
    <Section title="Feeds" className="rss">
      {feeds.length === 0 ? (
        <Empty>
          No feeds yet. <SetupLink>Add feed addresses</SetupLink>
        </Empty>
      ) : !data ? null : data.unsaved ? (
        <Empty>Save the board to load these feeds.</Empty>
      ) : (
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
  const { data } = useWidgetData<{ releases: ReleaseInfo[]; unsaved?: boolean }>(`/api/releases/${encodeURIComponent(board)}/${encodeURIComponent(id)}`, 30 * 60_000, config?.repos);
  return (
    <Section title="Releases" className="releases">
      {repos.length === 0 ? (
        <Empty>
          No projects yet. <SetupLink>Add GitHub projects</SetupLink>
        </Empty>
      ) : !data ? null : data.unsaved ? (
        <Empty>Save the board to load these releases.</Empty>
      ) : (
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
