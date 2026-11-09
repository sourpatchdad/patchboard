import { useEffect, useState } from 'react';

export interface LogLine {
  n: number;
  stream: 'out' | 'err';
  text: string;
  /** When Docker received the line; shown in the viewer's own time. */
  at?: number;
  /** The app's own timestamp, cut from the front of the text. */
  own?: string;
}

// An app's own timestamp at the start of a line: 2026-11-09 01:17:45,
// [2026-11-09T01:17:45.123Z], 2026/11/09 01:17:45 +0000 and the like.
const OWN_STAMP = /^\[?\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?: ?(?:Z|UTC|[+-]\d{2}:?\d{2}))?\]?\s+/;

/** Local time for a log line, with seconds: the zone the reader is in. */
export const logTime = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export type LogStatus = 'idle' | 'streaming' | 'ended' | 'failed';

export const LEVEL_ERROR = /\b(ERROR|ERR|FATAL|CRIT(ICAL)?|PANIC)\b|\[(error|fatal)\]/i;
export const LEVEL_WARN = /\b(WARN(ING)?)\b|\[warn\]/i;

export function lineClass(l: LogLine): string {
  return `ll ${l.stream === 'err' ? 'll-err' : ''} ${LEVEL_ERROR.test(l.text) ? 'll-error' : LEVEL_WARN.test(l.text) ? 'll-warn' : ''}`;
}

/**
 * Follow a container's logs over SSE. Lines arrive in bursts, so they're
 * batched per animation frame and capped at `max` to keep the DOM small.
 */
export function useLogStream(name: string | undefined, tail = 400, max = 3000) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<LogStatus>('idle');
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!name) return;
    setLines([]);
    setStatus('streaming');
    setFailure('');
    let n = 0;
    let pending: LogLine[] = [];
    let raf = 0;
    const flush = () => {
      raf = 0;
      const batch = pending;
      pending = [];
      setLines((prev) => {
        const next = prev.concat(batch);
        return next.length > max ? next.slice(next.length - max) : next;
      });
    };
    const es = new EventSource(`/api/logs/${encodeURIComponent(name)}?tail=${tail}`);
    es.onmessage = (m) => {
      const l = JSON.parse(m.data as string) as { stream: 'out' | 'err'; text: string; at?: number };
      // With Docker's time to show, the app's own copy (often in UTC or the
      // container's zone) only repeats it; it stays on hover.
      const own = l.at ? OWN_STAMP.exec(l.text)?.[0] : undefined;
      pending.push({ n: n++, ...l, text: own ? l.text.slice(own.length) : l.text, own: own?.trim() });
      if (!raf) raf = requestAnimationFrame(flush);
    };
    es.addEventListener('failure', (m) => {
      setStatus('failed');
      setFailure((JSON.parse((m as MessageEvent).data as string) as { message: string }).message);
      es.close();
    });
    es.onerror = () => {
      setStatus((s) => (s === 'failed' ? s : 'ended'));
      es.close();
    };
    return () => {
      es.close();
      cancelAnimationFrame(raf);
    };
  }, [name, tail, max]);

  return { lines, status, failure };
}
