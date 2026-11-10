// Push from a service instead of asking it every few seconds: one WebSocket
// per service, using Node's own client (no extra package), reconnecting on
// its own with a growing pause. Patchboard keeps nothing but the last
// streams it passed on, so a line costs a few kilobytes, not a buffer.

import type { Stream } from '../../shared/types.ts';

export interface LineHandlers {
  /** Connected: say hello or subscribe. */
  open?(send: (text: string) => void): void;
  message(text: string, send: (text: string) => void): void;
  /** Dropped: the poll takes over until it's back. */
  close?(): void;
}

/** ws:// for http://, wss:// for https://. */
export const wsUrl = (url: string) => url.replace(/^http/i, 'ws').replace(/\/+$/, '');

/**
 * Keep one WebSocket open. Its address carries a key, so it's never logged.
 * Returns a function that closes it for good.
 */
export function keepSocket(url: string, h: LineHandlers): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let wait = 5_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const retry = () => {
    if (stopped) return;
    timer = setTimeout(connect, wait);
    timer.unref?.();
    wait = Math.min(wait * 2, 5 * 60_000);
  };
  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(url);
    } catch {
      return retry();
    }
    const line = ws;
    const send = (text: string) => {
      if (line.readyState === WebSocket.OPEN) line.send(text);
    };
    line.addEventListener('open', () => {
      wait = 5_000;
      h.open?.(send);
    });
    line.addEventListener('message', (e) => {
      try {
        h.message(typeof e.data === 'string' ? e.data : '', send);
      } catch {
        // One message it can't read doesn't end the line.
      }
    });
    line.addEventListener('close', () => {
      h.close?.();
      retry();
    });
    // An error is always followed by close, which reconnects.
    line.addEventListener('error', () => {});
  }
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}

const key = (s: Stream) => `${s.user}|${s.title}|${s.subtitle ?? ''}`;

/**
 * Whether new streams are news: someone started, stopped, paused, resumed,
 * switched to transcoding, or jumped (a seek). Plain playing time isn't news:
 * the browser runs the bar on by itself, so steady playback sends nothing.
 */
export function streamsChanged(prev: { streams: Stream[]; at: number } | null, next: Stream[], now: number): boolean {
  if (!prev || prev.streams.length !== next.length) return true;
  const before = new Map(prev.streams.map((s) => [key(s), s]));
  const elapsed = (now - prev.at) / 1000;
  for (const s of next) {
    const p = before.get(key(s));
    if (!p || p.state !== s.state || !!p.transcode !== !!s.transcode) return true;
    if (s.positionSec != null && p.positionSec != null) {
      const expected = p.positionSec + (p.state === 'playing' ? elapsed : 0);
      if (Math.abs(s.positionSec - expected) > 10) return true;
    }
  }
  return false;
}
