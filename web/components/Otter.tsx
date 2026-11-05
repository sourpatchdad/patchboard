// The otter in the page: the header mark and the mascot in quiet, empty and
// lost moments. Each mood has a dark-page and a light-page image; CSS shows
// the one that matches the scheme, and the browser only fetches what shows.

import { type OtterMood, otterSrc } from '../../shared/otter.ts';
import { useAppearance } from '../lib/appearance.ts';

export function Otter({ mood = 'calm', size = 72, tile, className, label }: { mood?: OtterMood; size?: number; tile?: boolean; className?: string; label?: string }) {
  return (
    <span
      className={`otter ${className ?? ''}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img className="otter-on-dark" src={otterSrc(mood, { tile })} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} />
      <img className="otter-on-light" src={otterSrc(mood, { tile, light: true })} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}

/** The mascot, unless this device turned it off in Settings, Look. */
export function Mascot(props: Parameters<typeof Otter>[0]) {
  const { otter } = useAppearance();
  return otter ? <Otter {...props} /> : null;
}
