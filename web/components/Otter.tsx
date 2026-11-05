// The otter in the page: the header mark and the mascot in quiet, empty and
// lost moments. The SVG comes from shared/otter.ts, our own string, never
// user input, so setting it as HTML is safe.

import { useMemo } from 'react';
import { type OtterMood, otterSvg } from '../../shared/otter.ts';
import { useAppearance } from '../lib/appearance.ts';

export function Otter({ mood = 'calm', size = 72, small, className, label }: { mood?: OtterMood; size?: number; small?: boolean; className?: string; label?: string }) {
  const svg = useMemo(() => otterSvg({ mood, bg: 'none', small: small ?? size < 40 }), [mood, size, small]);
  return (
    <span
      className={`otter ${className ?? ''}`}
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/** The mascot, unless this device turned it off in Settings, Look. */
export function Mascot(props: Parameters<typeof Otter>[0]) {
  const { otter } = useAppearance();
  return otter ? <Otter {...props} /> : null;
}
