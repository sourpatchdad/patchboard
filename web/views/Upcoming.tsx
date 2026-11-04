// Two weeks of episodes and films as a grid of days: it fills a wide screen
// instead of stretching one list across it, and folds to a list on a phone.

import type { ReleaseItem } from '../../shared/types.ts';
import { Empty } from '../components/ui.tsx';
import { dayLabel, dayOffset, plural } from '../lib/format.ts';
import { useNow } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';
import { ReleaseRow, useReleases } from './Home.tsx';

type Kind = 'all' | 'episode' | 'movie';

export function Upcoming() {
  const now = useNow();
  const { items, any } = useReleases();
  const [kind, setKind] = useUrlChoice<Kind>('show', ['all', 'episode', 'movie'], 'all');

  const ahead = items.filter((it) => dayOffset(it.when, now) >= 0);
  const shown = ahead.filter((it) => kind === 'all' || it.kind === kind);
  const byDay = new Map<string, { off: number; list: ReleaseItem[] }>();
  for (const it of shown) {
    const label = dayLabel(it.when, now);
    const entry = byDay.get(label) ?? { off: dayOffset(it.when, now), list: [] };
    entry.list.push(it);
    byDay.set(label, entry);
  }
  const episodes = ahead.filter((i) => i.kind === 'episode').length;
  const films = ahead.length - episodes;
  const thisWeek = shown.filter((i) => dayOffset(i.when, now) < 7).length;

  return (
    <div className="page upcoming-page">
      <div className="page-head">
        <h1 className="page-title">Upcoming</h1>
        {ahead.length > 0 && (
          <span className="section-count">
            {plural(thisWeek, 'release')} this week, {shown.length} in two weeks
          </span>
        )}
      </div>
      <p className="page-lede">Episodes and films from Sonarr, Radarr and your Trakt calendar.</p>
      {ahead.length > 0 && (
        <div className="seg sort-seg" role="group" aria-label="Show">
          {(
            [
              ['all', `Everything ${ahead.length}`],
              ['episode', `Episodes ${episodes}`],
              ['movie', `Films ${films}`],
            ] as [Kind, string][]
          ).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>
              {label}
            </button>
          ))}
        </div>
      )}
      {!any && <Empty>Connect Sonarr, Radarr or Trakt to fill this calendar.</Empty>}
      {any && byDay.size === 0 && <Empty>{kind === 'all' ? 'Nothing scheduled in the next two weeks.' : 'None of these in the next two weeks.'}</Empty>}
      <div className="agenda agenda-grid">
        {[...byDay].map(([day, { off, list }]) => (
          <section className={`agenda-day ${off === 0 ? 'is-today' : ''}`} key={day} aria-label={day}>
            <h3>
              {day}
              <span>{list.length}</span>
            </h3>
            <ul>
              {list.map((it) => (
                <ReleaseRow key={it.id} it={it} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
