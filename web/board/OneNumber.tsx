// A widget shown as one number: its name, the number as large as the card
// allows, and a line under it. Made for a small screen (a Pi with a 3.5 inch
// display, a corner of a wall tablet) where a list would be unreadable. The
// number comes from the same source the full widget reads; which one is the
// widget's own choice (CPU or memory, download or ping), listed in NUMBERS.

import type { CSSProperties } from 'react';
import { NUMBERS, type Widget } from '../../shared/board.ts';
import { historyFor, type Reading, readingOf } from '../../shared/reading.ts';
import { Empty, Section } from '../components/ui.tsx';
import { Spark } from '../components/Spark.tsx';
import { useHistory } from '../lib/api.ts';
import { useAppearance } from '../lib/appearance.ts';
import { deg, pct, size, uptime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { locale, num } from '../lib/region.ts';
import { useStore } from '../lib/store.tsx';
import { SetupLink } from './SetupLink.tsx';

export type { Reading };

/** The number as large as the card allows, with its line under it. */
export function OneNumber({ title, label, reading }: { title: string; label: string; reading: Reading | null | undefined }) {
  return (
    <Section title={title} className="one-number">
      {reading === undefined ? null : reading === null ? (
        <Empty>
          {t('Nothing to show yet.')} <SetupLink>{t('Check its settings')}</SetupLink>
        </Empty>
      ) : (
        <div className={`one-number-body${reading.tone ? ` tone-${reading.tone}` : ''}`} role="group" aria-label={`${label}: ${reading.value}`}>
          {/* Its length sizes it: as large as fits on one line. */}
          <span className="one-number-value" style={{ '--chars': Math.max(4, [...reading.value].reduce((n, c) => n + (/[%°$€£MW]/.test(c) ? 1.4 : /[.,:\s]/.test(c) ? 0.5 : 1), 0)) } as CSSProperties}>
            {reading.value}
          </span>
          <span className="one-number-label">{reading.sub ?? label}</span>
          {/* Always there, empty when there's no line, so cards in a row end level. */}
          <span className="one-number-line">
            {reading.line && reading.line.data.length > 1 && (
              <Spark data={reading.line.data} min={reading.line.min ?? Math.min(...reading.line.data.map((p) => p[1]))} max={reading.line.max ?? Math.max(...reading.line.data.map((p) => p[1]))} height={40} label={reading.line.label} />
            )}
          </span>
        </div>
      )}
    </Section>
  );
}

/** The widget's chosen number, worked out in shared/reading.ts with this browser's words, formats and history. */
function useReading(w: Widget, now: number): Reading | null | undefined {
  const { snap } = useStore();
  const { temp: unit } = useAppearance();
  const need = historyFor(w, snap?.sources ?? {});
  const history = useHistory(need.keys, need.hours, 96);
  if (!snap) return undefined;
  return readingOf(w, {
    sources: snap.sources,
    alerts: snap.alerts,
    limits: snap.limits,
    unit,
    now,
    history,
    f: { t, count: (n) => num(n, 0), pct, size, uptime, deg, day: (d) => d.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }) },
  });
}

/** A widget as one number, for every type in NUMBERS but Markets, which reads its own prices. */
export function NumberView({ w, now, name }: { w: Widget; now: number; name: string }) {
  const reading = useReading(w, now);
  const which = w.config?.number ?? NUMBERS[w.type]?.[0][0];
  const label = NUMBERS[w.type]?.find(([k]) => k === which)?.[1] ?? name;
  return <OneNumber title={name} label={t(label)} reading={reading} />;
}
