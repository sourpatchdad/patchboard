import { useEffect, useState } from 'react';

export interface LogLine {
  n: number;
  stream: 'out' | 'err';
  text: string;
}

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
      const l = JSON.parse(m.data as string) as { stream: 'out' | 'err'; text: string };
      pending.push({ n: n++, ...l });
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
