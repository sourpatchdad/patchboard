import type { ReleaseItem } from '../../shared/types.ts';
import { Empty } from '../components/ui.tsx';
import { dayLabel, dayOffset } from '../lib/format.ts';
import { useNow } from '../lib/store.tsx';
import { ReleaseRow, useReleases } from './Home.tsx';

export function Upcoming() {
  const now = useNow();
  const { items, any } = useReleases();

  const byDay = new Map<string, { off: number; list: ReleaseItem[] }>();
  for (const it of items) {
    const off = dayOffset(it.when, now);
    if (off < 0) continue;
    const label = dayLabel(it.when, now);
    const entry = byDay.get(label) ?? { off, list: [] };
    entry.list.push(it);
    byDay.set(label, entry);
  }

  return (
    <div className="page page-narrow">
      <h1 className="page-title">Upcoming</h1>
      <p className="page-lede">Episodes and films from Sonarr, Radarr and your Trakt calendar for the next two weeks.</p>
      {!any && <Empty>Connect Sonarr, Radarr or Trakt to fill this calendar.</Empty>}
      {any && byDay.size === 0 && <Empty>Nothing scheduled in the next two weeks.</Empty>}
      <div className="agenda">
        {[...byDay].map(([day, { off, list }]) => (
          <div className={`agenda-day ${off === 0 ? 'is-today' : ''}`} key={day}>
            <h3>{day}</h3>
            <ul>
              {list.map((it) => (
                <ReleaseRow key={it.id} it={it} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
