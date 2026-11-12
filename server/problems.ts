// The Monitor page's log feed: warning and error lines from every running
// container, masked, as one stream. One set of log followers serves every
// screen watching; it starts with the first and stops a minute after the
// last leaves. Household devices may read this feed and no other logs, so
// only lines that say something went wrong ever leave the server this way.

import { redact } from './redact.ts';

export interface ProblemLine {
  at: number;
  container: string;
  level: 'warn' | 'error';
  text: string;
}

type LogLine = { stream: 'out' | 'err'; text: string; at?: number };
type Follow = (name: string, tail: number, onLine: (l: LogLine) => void, signal: AbortSignal) => Promise<void>;

// Words that mean trouble, as whole words, and the ways apps say "no trouble".
const ERROR = /\b(?:error|err|fatal|panic|exception|critical|crit|failed|failure)\b|level=(?:error|fatal|crit)/i;
const WARN = /\b(?:warn|warning|wrn)\b|level=warn/i;
const FINE = /\b(?:no|0|zero) (?:errors?|warnings?|failures?)\b|\b(?:errors?|warnings?|failures?|failed)[=:]\s*0\b/i;

export function classify(text: string): ProblemLine['level'] | null {
  if (FINE.test(text) && !/\b(?:fatal|panic|exception)\b/i.test(text)) return null;
  if (ERROR.test(text)) return 'error';
  if (WARN.test(text)) return 'warn';
  return null;
}

const KEEP = 150;
// A container that floods (a crash loop, a chatty warning) gets this many lines a minute.
const PER_MINUTE = 12;
const LINGER_MS = 60_000;
const RESCAN_MS = 60_000;

export class ProblemFeed {
  private lines: ProblemLine[] = [];
  private listeners = new Set<(l: ProblemLine) => void>();
  private followers = new Map<string, AbortController>();
  private counts = new Map<string, { minute: number; n: number }>();
  private rescan?: ReturnType<typeof setInterval>;
  private stopTimer?: ReturnType<typeof setTimeout>;

  private running: () => string[];
  private follow: Follow;
  private now: () => number;

  constructor(running: () => string[], follow: Follow, now: () => number = Date.now) {
    this.running = running;
    this.follow = follow;
    this.now = now;
  }

  /** The lines so far, oldest first, then each new one as it arrives. */
  subscribe(onLine: (l: ProblemLine) => void): { backlog: ProblemLine[]; unsubscribe: () => void } {
    clearTimeout(this.stopTimer);
    this.listeners.add(onLine);
    if (!this.rescan) this.start();
    return {
      backlog: [...this.lines],
      unsubscribe: () => {
        this.listeners.delete(onLine);
        if (!this.listeners.size) this.stopTimer = setTimeout(() => this.stop(), LINGER_MS);
      },
    };
  }

  private start(): void {
    this.scan();
    this.rescan = setInterval(() => this.scan(), RESCAN_MS);
  }

  stop(): void {
    clearTimeout(this.stopTimer);
    clearInterval(this.rescan);
    this.rescan = undefined;
    for (const ac of this.followers.values()) ac.abort();
    this.followers.clear();
  }

  /** Follow every running container not followed yet; a stopped one's stream ends by itself. */
  private scan(): void {
    for (const name of this.running()) {
      if (this.followers.has(name)) continue;
      const ac = new AbortController();
      this.followers.set(name, ac);
      // A little history on first sight, so the feed isn't empty when it opens.
      void this.follow(name, 40, (l) => this.take(name, l), ac.signal)
        .catch(() => undefined)
        .finally(() => {
          if (this.followers.get(name) === ac) this.followers.delete(name);
        });
    }
  }

  private take(container: string, l: LogLine): void {
    const level = classify(l.text);
    if (!level) return;
    const minute = Math.floor(this.now() / 60_000);
    const c = this.counts.get(container);
    if (c && c.minute === minute) {
      if (++c.n > PER_MINUTE) return;
    } else this.counts.set(container, { minute, n: 1 });
    const line: ProblemLine = { at: l.at ?? this.now(), container, level, text: redact(l.text).slice(0, 300) };
    this.lines.push(line);
    if (this.lines.length > KEEP) this.lines.splice(0, this.lines.length - KEEP);
    for (const fn of this.listeners) fn(line);
  }
}
