// Notifications through ntfy, Gotify, Pushover or email, opt-in. A problem in Needs
// attention is sent once it has lasted two minutes, so a container that
// restarts on its own never buzzes a phone, and once more when it clears.
// What was sent is remembered across restarts, so a restart doesn't resend
// everything that is still wrong. Messages go only to the server you set.

import type { Alert } from '../shared/types.ts';
import { config } from './config.ts';
import { kvGet, kvSet } from './db.ts';
import { request } from './http.ts';
import { sendMail } from './smtp.ts';

/** How long a problem lasts before it is worth a notification. */
export const SETTLE_MS = 2 * 60_000;

export interface Message {
  title: string;
  body: string;
  level: 'critical' | 'warn' | 'resolved' | 'test';
  /** Where a tap goes: a page on Patchboard, or an outside link. */
  href?: string;
}

const NTFY_PRIORITY = { critical: 5, warn: 4, resolved: 2, test: 3 } as const;
const NTFY_TAGS = { critical: ['rotating_light'], warn: ['warning'], resolved: ['white_check_mark'], test: ['wave'] } as const;
const GOTIFY_PRIORITY = { critical: 8, warn: 5, resolved: 2, test: 4 } as const;
const PUSHOVER_PRIORITY = { critical: 1, warn: 0, resolved: -1, test: 0 } as const;

export type Channel = 'ntfy' | 'gotify' | 'pushover' | 'email';

function clickUrl(href: string | undefined): string | undefined {
  if (!href) return config.notify.publicUrl;
  if (/^https?:\/\//.test(href)) return href;
  return config.notify.publicUrl ? `${config.notify.publicUrl}${href}` : undefined;
}

/** Send one message to every notifier that is set up, or only `only`. Throws if any fails. */
export async function send(m: Message, only?: Channel): Promise<void> {
  const use = (c: Channel) => !only || only === c;
  const ntfy = use('ntfy') ? config.notify.ntfy : undefined;
  const gotify = use('gotify') ? config.notify.gotify : undefined;
  const pushover = use('pushover') ? config.notify.pushover : undefined;
  const email = use('email') ? config.notify.email : undefined;
  const click = clickUrl(m.href);
  const jobs: Promise<unknown>[] = [];
  if (ntfy) {
    // ntfy's JSON publish goes to the server root with the topic inside, so
    // titles with accents or degree signs survive (headers can't carry them).
    const u = new URL(ntfy.url);
    const topic = u.pathname.replace(/^\/+|\/+$/g, '');
    const root = `${u.origin}/`;
    jobs.push(
      request(root, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ntfy.token ? { Authorization: `Bearer ${ntfy.token}` } : {}) },
        body: JSON.stringify({ topic, title: m.title, message: m.body, priority: NTFY_PRIORITY[m.level], tags: NTFY_TAGS[m.level], ...(click ? { click } : {}) }),
      }),
    );
  }
  if (gotify) {
    jobs.push(
      request(`${gotify.url}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Gotify-Key': gotify.token },
        body: JSON.stringify({
          title: m.title,
          message: m.body,
          priority: GOTIFY_PRIORITY[m.level],
          ...(click ? { extras: { 'client::notification': { click: { url: click } } } } : {}),
        }),
      }),
    );
  }
  if (pushover) {
    jobs.push(
      request('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: pushover.token, user: pushover.user, title: m.title, message: m.body || m.title, priority: PUSHOVER_PRIORITY[m.level], ...(click ? { url: click, url_title: 'Open in Patchboard' } : {}) }),
      }),
    );
  }
  if (email) {
    const prefix = m.level === 'critical' ? '[Down] ' : m.level === 'warn' ? '[Warning] ' : m.level === 'resolved' ? '[Fixed] ' : '';
    jobs.push(sendMail(email, `${prefix}${m.title}`, [m.body, click ? `\n${click}` : ''].filter(Boolean).join('\n')));
  }
  if (!jobs.length) throw new Error('No notifier is set up');
  await Promise.all(jobs);
}

const ORDER = { critical: 2, warn: 1, info: 0 } as const;

export interface State {
  /** First time each alert id was seen in this run. */
  seen: Map<string, number>;
  /** Alerts already sent, with the title to use when they clear. */
  sent: Record<string, string>;
}

const state: State = { seen: new Map(), sent: kvGet<Record<string, string>>('notify-sent') ?? {} };

/** A message tied to the alert it opens or closes. */
export interface Planned extends Message {
  id: string;
}

/**
 * Which messages a set of alerts calls for now. Pure apart from noting when
 * each alert was first seen, so the tests can drive the clock.
 */
export function plan(alerts: Alert[], now: number, s: State, min: 'critical' | 'warn'): Planned[] {
  const out: Planned[] = [];
  const ids = new Set(alerts.map((a) => a.id));
  for (const id of [...s.seen.keys()]) if (!ids.has(id)) s.seen.delete(id);
  for (const a of alerts) {
    if (ORDER[a.level] < ORDER[min]) continue;
    if (!s.seen.has(a.id)) s.seen.set(a.id, now);
    if (s.sent[a.id] || now - s.seen.get(a.id)! < SETTLE_MS) continue;
    out.push({ id: a.id, title: a.title, body: a.detail ?? 'Open Patchboard for details.', level: a.level === 'critical' ? 'critical' : 'warn', href: a.href });
  }
  for (const [id, title] of Object.entries(s.sent)) {
    if (!ids.has(id)) out.push({ id, title: `Fixed: ${title}`, body: 'It cleared on its own or someone fixed it.', level: 'resolved' });
  }
  return out;
}

/** Record a message as delivered. */
export function delivered(m: Planned, s: State): void {
  if (m.level === 'resolved') delete s.sent[m.id];
  else s.sent[m.id] = m.title;
}

let sending = false;

/** Called whenever alerts change and every 30 seconds, so a settled alert goes out on time. */
export async function notifyAlerts(alerts: Alert[]): Promise<void> {
  const n = config.notify;
  if (config.demo || (!n.ntfy && !n.gotify && !n.pushover && !n.email) || sending) return;
  sending = true;
  try {
    for (const m of plan(alerts, Date.now(), state, config.notify.level)) {
      try {
        await send(m);
      } catch (err) {
        // Left unsent, so the next tick tries again.
        console.warn(`notify: ${(err as Error).message}`);
        return;
      }
      delivered(m, state);
      kvSet('notify-sent', state.sent);
    }
  } finally {
    sending = false;
  }
}
