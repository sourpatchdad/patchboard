// Playback stays compact on the board. Hover, focus or tap opens the details
// in a portal, so a small widget never clips the preview.

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Stream } from '../../shared/types.ts';
import type { MediaService } from '../lib/themes.ts';
import { Episode, Meter, Poster } from './ui.tsx';

// Closing a preview must not open the row its disappearing card uncovers.
let dismissedPointer: { x: number; y: number } | undefined;
const atDismissedPointer = (e: { clientX: number; clientY: number }) => !!dismissedPointer && Math.abs(e.clientX - dismissedPointer.x) < 2 && Math.abs(e.clientY - dismissedPointer.y) < 2;

function elapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Between polls, a playing stream runs on at real speed, so its bar and time
 * move every second instead of jumping when the next answer arrives. Paused
 * and buffering streams hold still. It never runs more than 30 seconds past
 * the last answer, so a service that stops reporting can't carry it far.
 */
export function useLivePosition(s: Stream): Stream {
  const base = useRef({ key: '', at: 0 });
  const key = `${s.positionSec}:${s.progress}:${s.state}`;
  if (base.current.key !== key) base.current = { key, at: Date.now() };
  const runs = s.state !== 'paused' && s.state !== 'buffering' && s.positionSec != null && !!s.durationSec;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!runs) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, [runs]);
  if (!runs) return s;
  const ahead = Math.min(30, Math.max(0, (now - base.current.at) / 1000));
  const positionSec = Math.min(s.durationSec!, s.positionSec! + ahead);
  return { ...s, positionSec, progress: (positionSec / s.durationSec!) * 100 };
}

/** `compact`: just the title, inline, for Right now folded by Fit; it opens the same details. */
export function StreamRow({ stream: reported, service, label, href, compact = false }: { stream: Stream; service: MediaService; label: string; href?: string; compact?: boolean }) {
  const s = useLivePosition(reported);
  const Wrap = compact ? 'span' : 'div';
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const leave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const skipFocus = useRef(false);
  const pointer = useRef<{ x: number; y: number } | undefined>(undefined);
  const rememberPointer = (e: { clientX: number; clientY: number }) => { pointer.current = { x: e.clientX, y: e.clientY }; };
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0, maxWidth: 340, maxHeight: window.innerHeight - 24 });
  const progress = Number.isFinite(s.progress) && s.progress >= 0 ? Math.min(100, s.progress) : null;
  const state = s.state === 'paused' ? 'Paused' : s.state === 'buffering' ? 'Buffering' : 'Playing';
  const cancelLeave = () => clearTimeout(leave.current);
  const close = (focus = false) => {
    if (focus) dismissedPointer = pointer.current;
    cancelLeave();
    setOpen(false);
    setPinned(false);
    if (focus && document.activeElement !== trigger.current) {
      skipFocus.current = true;
      trigger.current?.focus();
    }
  };
  const hoverOut = () => {
    cancelLeave();
    if (!pinned) leave.current = setTimeout(() => setOpen(false), 160);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const position = () => {
      const button = trigger.current?.getBoundingClientRect();
      const preview = card.current?.getBoundingClientRect();
      if (!button || !preview) return;
      const left = Math.max(12, Math.min(button.left, window.innerWidth - preview.width - 12));
      const below = button.bottom + 8;
      const top = below + preview.height <= window.innerHeight - 12 ? below : Math.max(12, button.top - preview.height - 8);
      // The page's density uses CSS zoom; fixed coordinates need layout units.
      const zoom = parseFloat(getComputedStyle(document.body).zoom) || 1;
      setPlace({ top: top / zoom, left: left / zoom, maxWidth: (window.innerWidth - 24) / zoom, maxHeight: (window.innerHeight - 24) / zoom });
    };
    const outside = (e: PointerEvent) => {
      if (!trigger.current?.contains(e.target as Node) && !card.current?.contains(e.target as Node)) close();
    };
    const escape = (e: KeyboardEvent) => {
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || e.key === '/') close();
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      }
    };
    const anotherPreview = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id) close();
    };
    document.addEventListener('patchboard:playback-preview', anotherPreview);
    document.dispatchEvent(new CustomEvent('patchboard:playback-preview', { detail: id }));
    position();
    const ro = new ResizeObserver(position);
    if (card.current) ro.observe(card.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      cancelLeave();
      ro.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
      document.removeEventListener('patchboard:playback-preview', anotherPreview);
    };
  }, [open]);

  return (
    <Wrap className={`stream playback ${compact ? 'is-compact' : ''}`} data-service={service}>
      <button
        ref={trigger}
        type="button"
        className="playback-trigger"
        aria-label={`${label}: ${s.title}, ${s.user}${progress !== null ? `, ${Math.round(progress)} percent` : ''}. Show playback details`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onPointerEnter={(e) => {
          rememberPointer(e);
          if (e.pointerType === 'mouse' && !atDismissedPointer(e)) { dismissedPointer = undefined; cancelLeave(); setOpen(true); }
        }}
        onPointerMove={(e) => {
          rememberPointer(e);
          if (e.pointerType === 'mouse' && !open && dismissedPointer && !atDismissedPointer(e)) { dismissedPointer = undefined; cancelLeave(); setOpen(true); }
        }}
        onPointerLeave={hoverOut}
        // Keyboard: Enter or Down opens the details; Tab always moves on to the
        // next thing on the page, so a row is never a trap.
        onFocus={() => {
          if (skipFocus.current) skipFocus.current = false;
        }}
        onBlur={(e) => { if (!card.current?.contains(e.relatedTarget as Node)) close(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            cancelLeave();
            setPinned(true);
            setOpen(true);
            requestAnimationFrame(() => card.current?.querySelector<HTMLButtonElement>('button')?.focus());
          }
        }}
        onClick={(e) => {
          cancelLeave();
          if (pinned) close();
          else {
            setPinned(true);
            setOpen(true);
            // From the keyboard (no pointer, detail 0): take focus into the details.
            if (e.detail === 0) requestAnimationFrame(() => card.current?.querySelector<HTMLElement>('button, a')?.focus());
          }
        }}
      >
        {compact ? (
          <span className="stream-title">{s.title}</span>
        ) : (
          <>
            <span className="stream-line">
              <span className="stream-title">{s.title}{s.subtitle && <span className="stream-sub"> <Episode text={s.subtitle} /></span>}</span>
              <span className="stream-user">{s.user}{s.state !== 'playing' && `, ${s.state}`}{s.transcode && ', transcoding'}</span>
            </span>
            {progress !== null && <Meter label={`${s.title} playback progress`} value={progress} />}
          </>
        )}
      </button>
      {open && createPortal(
        <div
          ref={card}
          id={id}
          role="dialog"
          aria-label={`${label} playback details`}
          className="playback-preview playback"
          data-service={service}
          style={place}
          onKeyDown={(e) => {
            if (e.key !== 'Tab' || !card.current) return;
            // The preview sits at the end of the page, so Tab would fall off it.
            // Shift+Tab from its first control goes back to the row; Tab from its
            // last goes on to whatever follows the row, as if it sat in place.
            const inside = [...card.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)')];
            if (e.shiftKey && e.target === inside[0]) {
              e.preventDefault();
              close(true);
            } else if (!e.shiftKey && e.target === inside[inside.length - 1]) {
              e.preventDefault();
              const all = [...document.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
                (el) => el.tabIndex >= 0 && !card.current!.contains(el) && el.getClientRects().length > 0 && !el.closest("[inert]"),
              );
              const after = all.find((el) => trigger.current && trigger.current.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING && !trigger.current.contains(el));
              close();
              (after ?? trigger.current)?.focus();
            }
          }}
          onPointerMove={rememberPointer}
          onPointerEnter={cancelLeave}
          onPointerLeave={hoverOut}
          onBlur={(e) => { if (!trigger.current?.contains(e.relatedTarget as Node) && !e.currentTarget.contains(e.relatedTarget as Node)) close(); }}
        >
          <header className="playback-preview-head">
            <span className="playback-service">{label}</span>
            <button type="button" className="text-button" onClick={() => close(true)}>Close</button>
          </header>
          <div className="playback-preview-body">
            <Poster title={s.title} thumb={s.thumb} small />
            <div className="playback-preview-copy">
              <strong>{s.title}</strong>
              {s.subtitle && <span>{s.subtitle}</span>}
              <span>{s.user}</span>
              <span className={s.state === 'playing' ? undefined : 'warn-text'}>{state} · {s.transcode ? 'Transcoding' : 'Direct playback'}</span>
            </div>
          </div>
          {progress !== null && <>
            <Meter label={`${s.title} playback progress`} value={progress} />
            <div className="playback-timing">
              <span>{s.positionSec != null && s.durationSec != null ? `${elapsed(s.positionSec)} / ${elapsed(s.durationSec)}` : 'Playback progress'}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
          </>}
          {progress === null && <p className="settings-note">This service does not report playback position.{s.durationSec != null && ` Length ${elapsed(s.durationSec)}.`}</p>}
          {s.positionSec != null && s.durationSec != null && <p className="playback-remaining">{elapsed(Math.max(0, s.durationSec - s.positionSec))} remaining{s.state === 'paused' ? ', paused' : ''}</p>}
          {href && <a className="section-action playback-open" href={href} target="_blank" rel="noreferrer">Open {label}</a>}
        </div>, document.body,
      )}
    </Wrap>
  );
}
