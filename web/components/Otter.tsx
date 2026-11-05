// The otter in the page: the header mark and the mascot in quiet, empty and
// lost moments. On a dark page the otter floats in its pool; on a light page
// it sits on its navy tile, so the cream whiskers in the art still show. CSS
// picks by scheme, and the browser only fetches what shows.

import { type OtterMood, otterSrc } from '../../shared/otter.ts';
import { useAppearance } from '../lib/appearance.ts';

export function Otter({ mood = 'calm', size = 72, tile, mark, className, label }: { mood?: OtterMood; size?: number; tile?: boolean; mark?: boolean; className?: string; label?: string }) {
  if (mark)
    return (
      <span className={`otter ${className ?? ''}`} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <img src={otterSrc(mood, { mark })} alt="" width={size} height={size} decoding="async" draggable={false} />
      </span>
    );
  return (
    <span
      className={`otter ${className ?? ''}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <img className="otter-on-dark" src={otterSrc(mood, { tile })} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} />
      <img className="otter-on-light" src={otterSrc(mood, { tile: true })} alt="" width={size} height={size} loading="lazy" decoding="async" draggable={false} />
    </span>
  );
}

/** The mascot, unless this device turned it off in Settings, Look. */
export function Mascot(props: Parameters<typeof Otter>[0]) {
  const { otter } = useAppearance();
  return otter ? <Otter {...props} /> : null;
}
