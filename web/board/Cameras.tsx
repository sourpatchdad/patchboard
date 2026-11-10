// Frigate on the board: each camera's newest frame, and what the cameras
// that detect objects saw today. Pictures come through the Patchboard
// server, so Frigate's address never has to reach the browser.

import { useEffect, useRef, useState } from 'react';
import type { FrigateData, FrigateEvent } from '../../shared/types.ts';
import { Empty, Section } from '../components/ui.tsx';
import { agoLong } from '../lib/format.ts';
import { useSource } from '../lib/store.tsx';
import { SetupLink } from './SetupLink.tsx';
import { useWidget } from './widget-context.ts';

/** front_door → Front door */
export const cameraName = (n: string) => {
  const s = n.replace(/[_-]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Seconds between frames while a camera is on screen. */
const FRAME_MS = 3_000;

/**
 * A camera's newest frame, close to live while you can see it: every few
 * seconds while it's on screen and the tab is in front, and not at all
 * otherwise, so a board left open in a background tab costs nothing. The
 * next frame loads off screen and swaps in, so the picture never blanks.
 * Patchboard passes each frame straight through without holding it, so
 * this costs bandwidth (a small JPEG every few seconds), not memory.
 */
function LiveFrame({ name }: { name: string }) {
  const img = useRef<HTMLImageElement>(null);
  const [src, setSrc] = useState(() => `/api/img/frigate?camera=${encodeURIComponent(name)}&t=${Date.now()}`);
  useEffect(() => {
    const el = img.current;
    if (!el) return;
    let seen = false;
    let timer = 0;
    let loading = false;
    const next = () => {
      if (loading || !seen || document.visibilityState !== 'visible') return;
      loading = true;
      const url = `/api/img/frigate?camera=${encodeURIComponent(name)}&t=${Date.now()}`;
      const pre = new Image();
      pre.onload = () => {
        loading = false;
        setSrc(url);
      };
      pre.onerror = () => {
        loading = false;
      };
      pre.src = url;
    };
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen) next();
    });
    io.observe(el);
    const onShow = () => next();
    document.addEventListener('visibilitychange', onShow);
    timer = window.setInterval(next, FRAME_MS);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onShow);
      clearInterval(timer);
    };
  }, [name]);
  return <img ref={img} src={src} alt="" decoding="async" />;
}

/** What a camera saw, as a short phrase: "Sam at the porch", "Car". */
const seen = (e: FrigateEvent) => {
  const what = e.name ?? cameraName(e.label);
  return e.zones.length ? `${what}, ${e.zones.map(cameraName).join(', ').toLowerCase()}` : what;
};

export function CamerasWidget({ config, now }: { config?: Record<string, string>; now: number }) {
  const { state, data } = useSource<FrigateData>('frigate');
  const { limit = 6 } = useWidget();
  if (!state || !data) return null;
  const pick = (config?.cameras ?? '').split('\n').filter(Boolean);
  const cams = pick.length ? pick.map((n) => data.cameras.find((c) => c.name === n)).filter((c) => !!c) : data.cameras;
  const names = new Set(cams.map((c) => c.name));
  const events = (data.events ?? []).filter((e) => names.has(e.camera)).slice(0, limit);
  const detecting = cams.some((c) => c.detect);
  const web = data.webUrl && data.webUrl !== '#' ? data.webUrl : undefined;
  return (
    <Section title="Cameras" source={state} className="cameras" action={web ? { label: 'Open Frigate', href: web } : undefined}>
      {cams.length === 0 ? (
        <Empty>
          Frigate has none of the cameras this widget names. <SetupLink>Change cameras</SetupLink>
        </Empty>
      ) : (
        <ul className="cam-grid">
          {cams.map((c) => {
            const body = (
              <>
                {c.online ? <LiveFrame name={c.name} /> : <span className="cam-off">Offline</span>}
                <span className="cam-name">{cameraName(c.name)}</span>
              </>
            );
            return (
              <li key={c.name} className={c.online ? undefined : 'is-off'}>
                {web ? (
                  <a href={`${web}/#${encodeURIComponent(c.name)}`} target="_blank" rel="noreferrer" className="cam" aria-label={`${cameraName(c.name)}, live in Frigate`}>
                    {body}
                  </a>
                ) : (
                  <span className="cam">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {detecting && (
        <>
          <h3 className="cam-head">Today</h3>
          {events.length === 0 ? (
            <p className="cam-quiet">Nothing seen in the last day.</p>
          ) : (
            <ul className="cam-events">
              {events.map((e) => {
                const body = (
                  <>
                    <img src={`/api/img/frigate?event=${encodeURIComponent(e.id)}`} alt="" loading="lazy" decoding="async" width={44} height={44} />
                    <span className="cam-ev-main">
                      <span className="cam-ev-what">{seen(e)}</span>
                      <span className="cam-ev-where">{cameraName(e.camera)}</span>
                    </span>
                    <span className="cam-ev-when">{agoLong(e.at, now)}</span>
                  </>
                );
                return (
                  <li key={e.id}>
                    {web ? (
                      <a href={`${web}/explore?event_id=${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer" className="cam-ev">
                        {body}
                      </a>
                    ) : (
                      <span className="cam-ev">{body}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}
