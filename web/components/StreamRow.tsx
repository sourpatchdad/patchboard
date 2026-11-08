// Playback stays compact on the board. Hover, focus or tap opens the details
// in a portal, so a small widget never clips the preview.

import { useId, useLayoutEffect, useRef, useState } from 'react';
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

export function StreamRow({ stream: s, service, label, href }: { stream: Stream; service: MediaService; label: string; href?: string }) {
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
    <div className="stream playback" data-service={service}>
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
        onFocus={(e) => {
          if (skipFocus.current) { skipFocus.current = false; return; }
          if (e.currentTarget.matches(':focus-visible')) setOpen(true);
        }}
        onBlur={(e) => { if (!card.current?.contains(e.relatedTarget as Node)) close(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || (e.key === 'Tab' && open && !e.shiftKey)) {
            e.preventDefault();
            cancelLeave();
            setPinned(true);
            setOpen(true);
            requestAnimationFrame(() => card.current?.querySelector<HTMLButtonElement>('button')?.focus());
          }
        }}
        onClick={() => {
          cancelLeave();
          if (pinned) close();
          else { setPinned(true); setOpen(true); }
        }}
      >
        <span className="stream-line">
          <span className="stream-title">{s.title}{s.subtitle && <span className="stream-sub"> <Episode text={s.subtitle} /></span>}</span>
          <span className="stream-user">{s.user}{s.state !== 'playing' && `, ${s.state}`}{s.transcode && ', transcoding'}</span>
        </span>
        {progress !== null && <Meter label={`${s.title} playback progress`} value={progress} />}
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
            if (e.key === 'Tab' && e.shiftKey && e.target === card.current?.querySelector('button')) {
              e.preventDefault();
              close(true);
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
    </div>
  );
}
