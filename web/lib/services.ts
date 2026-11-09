import type { ChecksData, Container, Service, ServiceCheck, Snapshot } from '../../shared/types.ts';

export type JackState = 'up' | 'warn' | 'down' | 'idle' | 'none';

const ICON_CDN = 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons';

/**
 * Accepts the same icon forms as Homepage: a full URL, a site path, or a
 * dashboard-icons name like "plex.png".
 */
export function iconUrl(icon?: string): string | undefined {
  if (!icon) return undefined;
  if (/^(https?:)?\/\//.test(icon) || icon.startsWith('/')) return icon;
  const m = /^(.+)\.(png|svg|webp)$/.exec(icon);
  if (m) return `${ICON_CDN}/${m[2]}/${m[1]}.${m[2]}`;
  if (/^(si|mdi)-/.test(icon)) return undefined;
  return `${ICON_CDN}/svg/${icon}.svg`;
}

export function containerMap(snap: Snapshot | null): Map<string, Container> {
  const list = (snap?.sources.docker?.data as { containers: Container[] } | null)?.containers ?? [];
  return new Map(list.map((c) => [c.name, c]));
}

/**
 * The container an integration's app actually runs in: the one its app in the
 * catalog names, else one called the usual name, else one whose image is the
 * app's (plexinc/pms-docker, lscr.io/linuxserver/qbittorrent). Undefined when
 * nothing here runs it, so a heading stays plain text instead of a dead link.
 */
export function findContainer(snap: Snapshot | null, usual: string, label: string): string | undefined {
  const ctrs = containerMap(snap);
  const apps = snap?.catalog.groups.flatMap((g) => g.services) ?? [];
  const app = apps.find((a) => a.container && ctrs.has(a.container) && (a.name.toLowerCase() === label.toLowerCase() || a.container === usual));
  if (app?.container) return app.container;
  if (ctrs.has(usual)) return usual;
  const word = new RegExp(`(^|[/_.-])${usual.replace(/[^a-z0-9]/gi, '')}([/:_.-]|$)`, 'i');
  return [...ctrs.values()].find((c) => word.test(c.image) || word.test(c.name))?.name;
}

export function checkFor(snap: Snapshot | null, name: string): ServiceCheck | undefined {
  return (snap?.sources.checks?.data as ChecksData | null)?.services[name];
}

/** "answers in 23 ms", "not answering (HTTP 502)". */
export function checkText(ck?: ServiceCheck): string {
  if (!ck) return '';
  return ck.ok ? `answers in ${ck.ms} ms` : `not answering (${ck.error ?? 'no answer'})`;
}

/**
 * Containers stopped on purpose from Patchboard (Needs attention's quiet
 * notes): every light shows them idle, not down. The store keeps it current.
 */
let parked = new Set<string>();
/** Stopped from Patchboard, as opposed to a job that runs on a schedule. */
export const isParked = (name?: string) => !!name && parked.has(name);

export function setParked(alerts: { id: string; subject?: string }[]): void {
  parked = new Set(alerts.filter((a) => a.id.startsWith('ctr-parked-') && a.subject).map((a) => a.subject!));
}

export function jackState(s: Service, containers: Map<string, Container>, ck?: ServiceCheck): JackState {
  const failing = !!ck && !ck.ok && ck.fails >= 2;
  if (!s.container) return failing ? 'warn' : ck?.ok ? 'up' : 'none';
  const c = containers.get(s.container);
  if (!c) return failing ? 'warn' : 'none';
  if (c.state === 'running') return c.health === 'unhealthy' || failing ? 'warn' : 'up';
  if (c.state === 'restarting') return 'down';
  return s.expectStopped || parked.has(c.name) ? 'idle' : 'down';
}

export const jackStateText: Record<JackState, string> = {
  up: 'running',
  warn: 'unhealthy',
  down: 'not running',
  idle: 'finished (runs on a schedule)',
  none: 'no container tracked',
};

/** What fits on a jack's tape: an explicit label, else the name if short, else its first word. */
export function tapeLabel(s: Service): string {
  if (s.label) return s.label;
  if (s.name.length <= 9) return s.name;
  const first = s.name.split(/\s+/)[0];
  return first.length <= 9 ? first : s.name;
}

/** The catalog entry that tracks this container, if any. */
export function serviceFor(snap: Snapshot | null, container: string): Service | undefined {
  return snap?.catalog.groups.flatMap((g) => g.services).find((s) => s.container === container);
}

/** A container's state as a jack would show it, honoring expectStopped. */
export function ctrState(c: Container, svc?: Service): JackState {
  if (c.state === 'running') return c.health === 'unhealthy' ? 'warn' : 'up';
  if (c.state === 'restarting') return 'down';
  if (c.state === 'created') return 'idle';
  return svc?.expectStopped || parked.has(c.name) ? 'idle' : 'down';
}

/** "Up 6 days (healthy)" -> "6 days"; problems keep Docker's full wording. */
/**
 * Docker's own wording, tidied into one style: "About an hour" becomes
 * "1 hour", "Less than a second" becomes "seconds", and health notes drop off
 * (health has its own signal).
 */
export function tidyDuration(s: string): string {
  return s
    .replace(/\s*\((healthy|unhealthy|health: starting)\)$/, '')
    .replace(/\bAbout an? /i, '1 ')
    .replace(/\bLess than a second\b/i, 'under a minute')
    .replace(/\bUp\b/, 'Up')
    // Docker's "Exited (1)" in plain words: a clean exit is just stopped.
    .replace(/^Exited \(0\)/, 'Stopped')
    .replace(/^Exited \((\d+)\)/, 'Stopped (error $1)')
    .trim();
}

/** "Up 6 days (healthy)" -> "6 days"; problems keep Docker's wording, tidied. */
export function shortStatus(c: Container): string {
  if (c.state === 'running' && c.health !== 'unhealthy') return tidyDuration(c.status.replace(/^Up\s+/, ''));
  return tidyDuration(c.status);
}

export function isExternal(href?: string): boolean {
  return !!href && /^https?:\/\//.test(href);
}
