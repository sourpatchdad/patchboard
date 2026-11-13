// What a widget shows as one number, worked out the same way in the browser
// (One number on a board) and on the server (an e-paper panel's picture).
// Everything that differs between the two, the words, the number formats
// and the history behind a line, comes in through the context.

import { daysUntil, nextDay } from './almanac.ts';
import { NUMBERS, type Widget } from './board.ts';
import { softTires } from './car.ts';
import { parseEntities } from './ha.ts';
import {
  type Alert,
  type ArrData,
  type CarData,
  type DnsData,
  type FastmailData,
  type GiteaData,
  type HomeAssistantData,
  type ImmichData,
  type Limits,
  MINER_HOT_C,
  MINER_WARM_C,
  type MinerData,
  minerKey,
  type MinifluxData,
  type MonitorData,
  type NextcloudData,
  type NutData,
  type PaperlessData,
  type PortainerData,
  type ScrutinyData,
  type SeerrData,
  type Series,
  type Snapshot,
  type SpeedData,
  type SyncthingData,
  type SystemData,
  type TruenasData,
  type UnifiData,
  type WeatherData,
} from './types.ts';

export type Tone = 'ok' | 'warn' | 'crit' | undefined;
export interface Reading {
  value: string;
  /** Under the number: what it is, or more about it. */
  sub?: string;
  tone?: Tone;
  /** A faint line of how it got here (or, for the weather, where it's going), and what that line covers. */
  line?: { data: Series; label: string; min?: number; max?: number };
}

/** Words and number formats, from the browser's language and region or the server's defaults. */
export interface ReadingFormat {
  t: (english: string, vars?: Record<string, string | number>) => string;
  count: (n: number) => string;
  pct: (n: number) => string;
  size: (bytes: number) => string;
  uptime: (sec: number) => string;
  deg: (c: number, unit: 'f' | 'c' | 'both') => number;
  day: (d: Date) => string;
}

export interface ReadingContext {
  sources: Snapshot['sources'];
  alerts: Alert[];
  limits?: Limits;
  unit: 'f' | 'c' | 'both';
  now: number;
  /** The series behind a line, by the keys historyFor asked for. */
  history: Record<string, Series>;
  f: ReadingFormat;
}

/** Gigahashes as people say them: 1.21 TH/s, 980 GH/s. */
export const hashrate = (gh: number): string => (gh >= 1000 ? `${(gh / 1000).toFixed(gh >= 10_000 ? 1 : 2)} TH/s` : `${Math.round(gh)} GH/s`);

/** Which number this widget shows: its own choice, or the first it offers. */
export const numberOf = (w: Widget): string | undefined => w.config?.number ?? NUMBERS[w.type]?.[0][0];

/** The history a widget's line needs, as keys and hours: the server's own CPU, memory and pool, or one miner. */
export function historyFor(w: Widget, sources: Snapshot['sources']): { keys: string[]; hours: number } {
  const which = numberOf(w);
  if (w.type === 'vitals') {
    const key = ({ cpu: 'cpu', memory: 'mem.used', storage: 'pool.used' } as Record<string, string>)[which ?? ''];
    return key ? { keys: [key], hours: key === 'pool.used' ? 24 * 30 : 24 } : { keys: [], hours: 24 };
  }
  const rigs = (sources.bitaxe?.data as MinerData | undefined)?.miners.filter((m) => m.ok) ?? [];
  if (w.type === 'miners' && rigs.length === 1) return { keys: [minerKey(rigs[0].name)], hours: 24 };
  return { keys: [], hours: 24 };
}

/** The widget's chosen number: null when its source has nothing, undefined while it loads. */
export function readingOf(w: Widget, ctx: ReadingContext): Reading | null | undefined {
  const { f, unit, now } = ctx;
  const which = numberOf(w);
  const keys = historyFor(w, ctx.sources).keys;
  const past = keys.length && w.type === 'vitals' ? ctx.history[keys[0]] : undefined;
  const minerPast = keys.length && w.type === 'miners' ? ctx.history[keys[0]] : undefined;
  const data = <T,>(id: string): T | null | undefined => {
    const s = ctx.sources[id as keyof typeof ctx.sources];
    return s ? ((s.data as T | null) ?? null) : undefined;
  };
  switch (w.type) {
    case 'attention': {
      const open = ctx.alerts.filter((a) => a.level !== 'info');
      return { value: f.count(open.length), sub: open.length ? open[0].title : f.t('All quiet'), tone: open.some((a) => a.level === 'critical') ? 'crit' : open.length ? 'warn' : 'ok' };
    }
    case 'vitals': {
      const sys = data<SystemData>('system');
      if (!sys) return sys;
      if (which === 'memory') {
        const m = sys.mem;
        return m ? { value: f.size(Math.max(0, m.total - m.available - m.arc)), sub: f.t('Memory in use, of {total}', { total: f.size(m.total) }), line: past && { data: past, label: f.t('Memory in use, last 24 hours'), min: 0, max: m.total } } : null;
      }
      if (which === 'storage') {
        const pool = data<TruenasData>('truenas')?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
        const used = pool?.usedPct ?? sys.pool?.usedPct;
        const limits = ctx.limits;
        return used == null ? null : { value: f.pct(used), sub: pool ? f.t('{pool} used', { pool: pool.name }) : f.t('Storage used'), tone: limits && used >= limits.poolCritPct ? 'crit' : limits && used >= limits.poolWarnPct ? 'warn' : undefined, line: past && { data: past, label: f.t('Storage used, last 30 days') } };
      }
      if (which === 'uptime') return { value: f.uptime(sys.uptimeSec), sub: f.t('Uptime') };
      return { value: f.pct(sys.cpuPct), sub: f.t('CPU'), line: past && { data: past, label: f.t('CPU, last 24 hours'), min: 0, max: 100 } };
    }
    case 'weather': {
      const wx = data<WeatherData>('weather');
      if (!wx) return wx;
      const today = wx.days[0];
      if (which === 'high') return today ? { value: `${f.deg(today.high, unit)}°`, sub: f.t('High today, low {low}°', { low: f.deg(today.low, unit) }) } : null;
      // The weather's line looks ahead: the next 24 hours.
      const hours = (wx.hours ?? []).slice(0, 24);
      if (which === 'rain') return today ? { value: `${today.precipPct}%`, sub: f.t('Chance of rain today'), line: { data: hours.map((h, i) => [i, h.precipPct]), label: f.t('Chance of rain, next 24 hours'), min: 0, max: 100 } } : null;
      return { value: `${f.deg(wx.tempNow, unit)}°`, sub: wx.label, line: { data: hours.map((h, i) => [i, h.temp]), label: f.t('Temperature, next 24 hours') } };
    }
    case 'countdown': {
      const next = (w.config?.events ?? '')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const at = l.lastIndexOf('=');
          const day = nextDay(l.slice(at + 1), now);
          return { name: l.slice(0, at), day, left: daysUntil(day, now) };
        })
        .filter((e) => e.left >= 0)
        .sort((x, y) => x.left - y.left)[0];
      if (!next) return null;
      return { value: next.left === 0 ? f.t('Today') : f.count(next.left), sub: next.left === 0 ? next.name : f.t('{days} to {name}, {day}', { days: next.left === 1 ? f.t('day') : f.t('days'), name: next.name, day: f.day(next.day) }) };
    }
    case 'car': {
      const car = data<CarData>('tessie')?.cars[0];
      if (!car) return car === undefined && data<CarData>('tessie') === undefined ? undefined : null;
      if (which === 'tire') {
        if (!car.tires) return null;
        const [pos, bar] = (Object.entries(car.tires) as [string, number][]).sort((a, b) => a[1] - b[1])[0];
        const names: Record<string, string> = { fl: f.t('Front left'), fr: f.t('Front right'), rl: f.t('Rear left'), rr: f.t('Rear right') };
        return { value: unit === 'c' ? `${bar.toFixed(1)} bar` : `${Math.round(bar * 14.5038)} psi`, sub: names[pos], tone: softTires(car.tires).length ? 'warn' : undefined };
      }
      if (which === 'range') return { value: unit === 'c' ? `${Math.round(car.rangeMi * 1.609)} km` : `${car.rangeMi} mi`, sub: f.t('{name} range', { name: car.name }) };
      return { value: `${car.battery}%`, sub: car.charging === 'Charging' ? f.t('{name}, charging', { name: car.name }) : car.name, tone: car.battery <= 20 ? 'warn' : undefined };
    }
    case 'dns': {
      const d = data<DnsData>('pihole') ?? data<DnsData>('adguard');
      if (!d) return d;
      if (which === 'pct') return { value: `${Math.round(d.pct)}%`, sub: f.t('of queries blocked today'), tone: d.protecting ? undefined : 'warn' };
      return { value: f.count(d.blocked), sub: d.protecting ? f.t('blocked today') : f.t('blocked today, blocking paused'), tone: d.protecting ? undefined : 'warn' };
    }
    case 'speed': {
      const sp = data<SpeedData>('speedtest');
      const l = sp?.latest;
      if (!l) return l === undefined ? undefined : null;
      const runs = (k: 'down' | 'up' | 'ping', label: string) => ({ data: (sp?.runs ?? []).filter((r) => r[k] != null).map((r) => [r.at, r[k]!] as [number, number]), label, min: 0 });
      if (which === 'up') return { value: f.count(Math.round(l.up)), sub: f.t('Mbps up'), line: runs('up', f.t('Upload, recent tests')) };
      if (which === 'ping') return l.ping == null ? null : { value: f.count(Math.round(l.ping)), sub: f.t('ms ping'), line: runs('ping', f.t('Ping, recent tests')) };
      return { value: f.count(Math.round(l.down)), sub: f.t('Mbps down'), tone: l.healthy === false ? 'warn' : undefined, line: runs('down', f.t('Download, recent tests')) };
    }
    case 'power': {
      const u = data<NutData>('nut')?.ups[0];
      if (!u) return u;
      const tone: Tone = u.lowBattery ? 'crit' : u.onBattery ? 'warn' : undefined;
      if (which === 'runtime') return u.runtimeSec == null ? null : { value: u.runtimeSec >= 3600 ? `${Math.floor(u.runtimeSec / 3600)} h ${Math.round((u.runtimeSec % 3600) / 60)} m` : `${Math.round(u.runtimeSec / 60)} min`, sub: u.onBattery ? f.t('left, on battery') : f.t('on battery, if the power goes'), tone };
      if (which === 'load') return u.loadPct == null ? null : { value: `${Math.round(u.loadPct)}%`, sub: f.t('UPS load') };
      return u.charge == null ? null : { value: `${Math.round(u.charge)}%`, sub: u.onBattery ? f.t('On battery') : f.t('On mains'), tone };
    }
    case 'photos': {
      const d = data<ImmichData>('immich');
      if (!d) return d;
      return which === 'videos' ? { value: f.count(d.videos), sub: f.t('videos') } : { value: f.count(d.photos), sub: f.t('photos') };
    }
    case 'requests': {
      const d = data<SeerrData>('overseerr');
      if (!d) return d;
      return { value: f.count(d.pending), sub: d.pending === 1 ? f.t('request waiting') : f.t('requests waiting'), tone: d.pending ? 'warn' : undefined };
    }
    case 'dockerhosts': {
      const d = data<PortainerData>('portainer');
      if (!d) return d;
      const sum = (k: 'running' | 'unhealthy') => d.envs.reduce((n, e) => n + e[k], 0);
      if (which === 'unhealthy') return { value: f.count(sum('unhealthy')), sub: f.t('unhealthy containers'), tone: sum('unhealthy') ? 'warn' : 'ok' };
      return { value: f.count(sum('running')), sub: f.t('containers running') };
    }
    case 'network': {
      const d = data<UnifiData>('unifi');
      if (!d) return d;
      return { value: f.count(d.clients), sub: f.t('clients online') };
    }
    case 'drives': {
      const d = data<ScrutinyData>('scrutiny');
      if (!d) return d;
      if (which === 'hottest') {
        const hot = d.drives.filter((x) => x.temp != null).sort((a, b) => b.temp! - a.temp!)[0];
        return hot ? { value: `${f.deg(hot.temp!, unit)}°`, sub: hot.name } : null;
      }
      const bad = d.drives.filter((x) => x.status !== 'ok');
      return { value: f.count(bad.length), sub: bad.length ? bad.map((x) => x.name).join(', ') : f.t('All drives healthy'), tone: bad.some((x) => x.status === 'failed') ? 'crit' : bad.length ? 'warn' : 'ok' };
    }
    case 'sync': {
      const d = data<SyncthingData>('syncthing');
      if (!d) return d;
      const behind = d.folders.filter((f) => f.state !== 'idle');
      return { value: f.count(behind.length), sub: behind.length ? behind.map((f) => f.label).join(', ') : f.t('Every folder up to date'), tone: behind.some((f) => f.state === 'error' || f.state === 'failing') ? 'warn' : behind.length ? undefined : 'ok' };
    }
    case 'inbox': {
      const d = data<FastmailData>('fastmail');
      if (!d) return d;
      return { value: f.count(d.unread), sub: f.t('unread') };
    }
    case 'feeds': {
      const d = data<MinifluxData>('miniflux');
      if (!d) return d;
      return { value: f.count(d.unread), sub: f.t('unread articles') };
    }
    case 'managers': {
      const apps = (['lidarr', 'readarr', 'prowlarr', 'bazarr'] as const).map((id) => ({ id, d: data<ArrData>(id), ok: ctx.sources[id]?.ok }));
      const on = apps.filter((a) => a.d !== undefined);
      if (!on.length) return null;
      if (which === 'queued') return { value: f.count(on.reduce((s, a) => s + (a.d?.queueTotal ?? 0), 0)), sub: f.t('queued or missing subtitles') };
      const bad = on.filter((a) => !a.ok || (a.d?.health.length ?? 0) > 0 || (a.d?.problems.length ?? 0) > 0);
      return { value: f.count(bad.length), sub: bad.length ? bad.map((a) => a.id.charAt(0).toUpperCase() + a.id.slice(1)).join(', ') : f.t('All healthy'), tone: bad.length ? 'warn' : 'ok' };
    }
    case 'documents': {
      const d = data<PaperlessData>('paperless');
      if (!d) return d;
      return which === 'total' ? { value: f.count(d.total), sub: f.t('documents') } : { value: f.count(d.inbox), sub: f.t('in the inbox') };
    }
    case 'nextcloud': {
      const d = data<NextcloudData>('nextcloud');
      if (!d) return d;
      if (which === 'active') return d.activeToday == null ? null : { value: f.count(d.activeToday), sub: f.t('of {n} on today', { n: d.users }) };
      if (which === 'free') return d.freeBytes == null ? null : { value: f.size(d.freeBytes), sub: f.t('free') };
      return { value: f.count(d.files), sub: f.t('files') };
    }
    case 'git': {
      const d = data<GiteaData>('gitea');
      if (!d) return d;
      return which === 'repos' ? { value: f.count(d.repos), sub: f.t('repositories') } : { value: f.count(d.unread), sub: f.t('notifications') };
    }
    case 'halist':
    case 'climate':
    case 'people': {
      const ha = data<HomeAssistantData>('homeassistant');
      if (!ha) return ha;
      const ids = parseEntities(w.config?.entities, w.type);
      const found = ids.map((id) => ha.entities.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
      if (!found.length) return null;
      if (w.type === 'halist') return { value: f.count(Number(found[0].state) || 0), sub: f.t('to go on {name}', { name: found[0].name }) };
      if (w.type === 'people') {
        const home = found.filter((p) => p.state === 'home');
        return { value: `${home.length}/${found.length}`, sub: home.length ? home.map((p) => p.name).join(', ') : f.t('No one home') };
      }
      const a = found[0].attrs ?? {};
      return which === 'target' ? (a.target == null ? null : { value: `${a.target}°`, sub: f.t('{name} set to', { name: found[0].name }) }) : a.current == null ? null : { value: `${Math.round(a.current)}°`, sub: found[0].name };
    }
    case 'miners': {
      const d = data<MinerData>('bitaxe');
      if (!d) return d;
      const up = d.miners.filter((m) => m.ok);
      if (!up.length) return { value: '0', sub: f.t('No miner answering'), tone: 'crit' };
      if (which === 'temp') {
        const hot = up.filter((m) => m.tempC != null).sort((a, b) => b.tempC! - a.tempC!)[0];
        return hot ? { value: `${f.deg(hot.tempC!, unit)}°`, sub: hot.name, tone: hot.tempC! >= MINER_HOT_C ? 'crit' : hot.tempC! >= MINER_WARM_C ? 'warn' : undefined } : null;
      }
      if (which === 'power') return { value: `${Math.round(up.reduce((n, m) => n + (m.powerW ?? 0), 0))} W`, sub: up.length === 1 ? up[0].name : f.t('{n} miners', { n: up.length }) };
      return { value: hashrate(up.reduce((n, m) => n + m.hashGh, 0)), sub: up.length === 1 ? up[0].name : f.t('{n} miners', { n: up.length }), line: up.length === 1 && minerPast ? { data: minerPast, label: f.t('Hashrate, last 24 hours'), min: 0 } : undefined };
    }
    case 'monitoring': {
      const lists = [data<MonitorData>('netdata'), data<MonitorData>('prometheus')].filter((x) => x !== undefined);
      if (!lists.length) return null;
      const firing = lists.flatMap((x) => x?.alerts ?? []);
      return { value: f.count(firing.length), sub: firing.length ? firing[0].name : f.t('Nothing firing'), tone: firing.some((a) => a.severity === 'critical') ? 'crit' : firing.length ? 'warn' : 'ok' };
    }
  }
  return null;
}
