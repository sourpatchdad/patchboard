// Notifications through ntfy, Gotify, Pushover, Discord, email or a webhook, opt-in. A problem in Needs
// attention is sent once it has lasted two minutes, so a container that
// restarts on its own never buzzes a phone, and once more when it clears.
// What was sent is remembered per channel and across restarts, so a restart
// doesn't resend everything still wrong, and one broken channel doesn't make
// the others repeat themselves. Messages go only to the servers you set.

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
/** Discord embed colors: the same red, amber and green the app uses. */
const DISCORD_COLOR = { critical: 0xef5b4c, warn: 0xf0a43a, resolved: 0x4caf7a, test: 0x5b8def } as const;

export type Channel = 'ntfy' | 'gotify' | 'pushover' | 'discord' | 'email' | 'webhook';

const CHANNELS: Channel[] = ['ntfy', 'gotify', 'pushover', 'discord', 'email', 'webhook'];

/** The channels set up now. */
export const channels = (): Channel[] => CHANNELS.filter((c) => !!config.notify[c]);

/** Any notifier set up at all. */
export const anyNotifier = (): boolean => channels().length > 0;

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
  const discord = use('discord') ? config.notify.discord : undefined;
  const webhook = use('webhook') ? config.notify.webhook : undefined;
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
  if (discord) {
    jobs.push(
      request(discord.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Patchboard',
          // No @everyone or role pings from text that came from an app.
          allowed_mentions: { parse: [] },
          embeds: [{ title: m.title.slice(0, 256), description: m.body.slice(0, 2000), color: DISCORD_COLOR[m.level], ...(click ? { url: click } : {}) }],
        }),
      }),
    );
  }
  if (webhook) {
    // Plain JSON for Home Assistant, n8n, Apprise or anything else that takes a POST.
    jobs.push(
      request(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(webhook.token ? { Authorization: `Bearer ${webhook.token}` } : {}) },
        body: JSON.stringify({ source: 'patchboard', level: m.level, title: m.title, body: m.body, url: click ?? null, at: new Date().toISOString() }),
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

/** First sightings, shared by every channel. */
let seen = new Map<string, number>();
/** What each channel has delivered: alert id to the title to use when it clears. */
let sentBy: Partial<Record<Channel, Record<string, string>>> = loadSent();
/** The last failure each channel logged, so a down server logs once, not every tick. */
const lastError: Partial<Record<Channel, string>> = {};

function loadSent(): Partial<Record<Channel, Record<string, string>>> {
  const raw = kvGet<Record<string, unknown>>('notify-sent') ?? {};
  // Before per-channel records it was one map of id to title: every channel had sent it.
  if (Object.values(raw).some((v) => typeof v === 'string')) {
    const flat = raw as Record<string, string>;
    return Object.fromEntries(CHANNELS.map((c) => [c, { ...flat }]));
  }
  return raw as Partial<Record<Channel, Record<string, string>>>;
}

/** Tests only: forget what was seen and sent. */
export function resetNotifyForTests(): void {
  seen = new Map();
  sentBy = {};
  kvSet('notify-sent', {});
}

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

/**
 * Called whenever alerts change and every 30 seconds, so a settled alert goes
 * out on time. Each channel goes through the plan on its own: one that fails
 * keeps its messages for the next tick, and the rest carry on.
 */
export async function notifyAlerts(alerts: Alert[], now = Date.now()): Promise<void> {
  if (config.demo || !anyNotifier() || sending) return;
  sending = true;
  try {
    for (const ch of channels()) {
      const s: State = { seen, sent: (sentBy[ch] ??= {}) };
      for (const m of plan(alerts, now, s, config.notify.level)) {
        try {
          await send(m, ch);
          delete lastError[ch];
        } catch (err) {
          const msg = (err as Error).message;
          if (lastError[ch] !== msg) console.warn(`notify: ${ch}: ${msg}`);
          lastError[ch] = msg;
          break;
        }
        delivered(m, s);
        kvSet('notify-sent', sentBy);
      }
    }
  } finally {
    sending = false;
  }
}
