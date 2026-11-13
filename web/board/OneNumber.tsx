// A widget shown as one number: its name, the number as large as the card
// allows, and a line under it. Made for a small screen (a Pi with a 3.5 inch
// display, a corner of a wall tablet) where a list would be unreadable. The
// number comes from the same source the full widget reads; which one is the
// widget's own choice (CPU or memory, download or ping), listed in NUMBERS.

import type { CSSProperties } from 'react';
import { daysUntil, nextDay } from '../../shared/almanac.ts';
import { NUMBERS, type Widget } from '../../shared/board.ts';
import type { Series } from '../../shared/types.ts';
import type { ArrData, GiteaData, HomeAssistantData, MonitorData, NextcloudData, PaperlessData } from '../../shared/types.ts';
import { parseEntities } from '../../shared/ha.ts';
import type { CarData, DnsData, FastmailData, ImmichData, MinifluxData, NutData, PortainerData, ScrutinyData, SeerrData, SpeedData, SyncthingData, SystemData, TruenasData, UnifiData, WeatherData } from '../../shared/types.ts';
import { Empty, Section } from '../components/ui.tsx';
import { Spark } from '../components/Spark.tsx';
import { useHistory } from '../lib/api.ts';
import { useAppearance } from '../lib/appearance.ts';
import { needsYou } from '../lib/attention.ts';
import { deg, pct, size, uptime } from '../lib/format.ts';
import { t } from '../lib/i18n.ts';
import { locale, num } from '../lib/region.ts';
import { useStore } from '../lib/store.tsx';
import { SetupLink } from './SetupLink.tsx';
import { softTires } from '../../shared/car.ts';

type Tone = 'ok' | 'warn' | 'crit' | undefined;
export interface Reading {
  value: string;
  /** Under the number: what it is, or more about it. */
  sub?: string;
  tone?: Tone;
  /** A faint line of how it got here (or, for the weather, where it's going), and what that line covers. */
  line?: { data: Series; label: string; min?: number; max?: number };
}

/** The number as large as the card allows, with its line under it. */
export function OneNumber({ title, label, reading }: { title: string; label: string; reading: Reading | null | undefined }) {
  return (
    <Section title={title} className="one-number">
      {reading === undefined ? null : reading === null ? (
        <Empty>
          {t('Nothing to show yet.')} <SetupLink>{t('Check its settings')}</SetupLink>
        </Empty>
      ) : (
        <div className={`one-number-body${reading.tone ? ` tone-${reading.tone}` : ''}`} role="group" aria-label={`${label}: ${reading.value}`}>
          {/* Its length sizes it: as large as fits on one line. */}
          <span className="one-number-value" style={{ '--chars': Math.max(4, [...reading.value].reduce((n, c) => n + (/[%°$€£MW]/.test(c) ? 1.4 : /[.,:\s]/.test(c) ? 0.5 : 1), 0)) } as CSSProperties}>
            {reading.value}
          </span>
          <span className="one-number-label">{reading.sub ?? label}</span>
          {/* Always there, empty when there's no line, so cards in a row end level. */}
          <span className="one-number-line">
            {reading.line && reading.line.data.length > 1 && (
              <Spark data={reading.line.data} min={reading.line.min ?? Math.min(...reading.line.data.map((p) => p[1]))} max={reading.line.max ?? Math.max(...reading.line.data.map((p) => p[1]))} height={40} label={reading.line.label} />
            )}
          </span>
        </div>
      )}
    </Section>
  );
}

/** The widget's chosen number, read from the snapshot: null when its source has nothing, undefined while it loads. */
function useReading(w: Widget, now: number): Reading | null | undefined {
  const { snap } = useStore();
  const { temp: unit } = useAppearance();
  const which = w.config?.number ?? NUMBERS[w.type]?.[0][0];
  // The server's own history, for the numbers it keeps one of.
  const kept = w.type === 'vitals' ? ({ cpu: 'cpu', memory: 'mem.used', storage: 'pool.used' } as Record<string, string>)[which ?? ''] : undefined;
  const history = useHistory(kept ? [kept] : [], kept === 'pool.used' ? 24 * 30 : 24, 96);
  const past = kept ? history[kept] : undefined;
  if (!snap) return undefined;
  const data = <T,>(id: string): T | null | undefined => {
    const s = snap.sources[id as keyof typeof snap.sources];
    return s ? ((s.data as T | null) ?? null) : undefined;
  };
  const count = (n: number) => num(n, 0);
  switch (w.type) {
    case 'attention': {
      const open = needsYou(snap.alerts);
      return { value: count(open.length), sub: open.length ? open[0].title : t('All quiet'), tone: open.some((a) => a.level === 'critical') ? 'crit' : open.length ? 'warn' : 'ok' };
    }
    case 'vitals': {
      const sys = data<SystemData>('system');
      if (!sys) return sys;
      if (which === 'memory') {
        const m = sys.mem;
        return m ? { value: size(Math.max(0, m.total - m.available - m.arc)), sub: t('Memory in use, of {total}', { total: size(m.total) }), line: past && { data: past, label: t('Memory in use, last 24 hours'), min: 0, max: m.total } } : null;
      }
      if (which === 'storage') {
        const pool = data<TruenasData>('truenas')?.pools.slice().sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
        const used = pool?.usedPct ?? sys.pool?.usedPct;
        const limits = snap.limits;
        return used == null ? null : { value: pct(used), sub: pool ? t('{pool} used', { pool: pool.name }) : t('Storage used'), tone: limits && used >= limits.poolCritPct ? 'crit' : limits && used >= limits.poolWarnPct ? 'warn' : undefined, line: past && { data: past, label: t('Storage used, last 30 days') } };
      }
      if (which === 'uptime') return { value: uptime(sys.uptimeSec), sub: t('Uptime') };
      return { value: pct(sys.cpuPct), sub: t('CPU'), line: past && { data: past, label: t('CPU, last 24 hours'), min: 0, max: 100 } };
    }
    case 'weather': {
      const wx = data<WeatherData>('weather');
      if (!wx) return wx;
      const today = wx.days[0];
      if (which === 'high') return today ? { value: `${deg(today.high, unit)}°`, sub: t('High today, low {low}°', { low: deg(today.low, unit) }) } : null;
      // The weather's line looks ahead: the next 24 hours.
      const hours = (wx.hours ?? []).slice(0, 24);
      if (which === 'rain') return today ? { value: `${today.precipPct}%`, sub: t('Chance of rain today'), line: { data: hours.map((h, i) => [i, h.precipPct]), label: t('Chance of rain, next 24 hours'), min: 0, max: 100 } } : null;
      return { value: `${deg(wx.tempNow, unit)}°`, sub: wx.label, line: { data: hours.map((h, i) => [i, h.temp]), label: t('Temperature, next 24 hours') } };
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
      return { value: next.left === 0 ? t('Today') : count(next.left), sub: next.left === 0 ? next.name : t('{days} to {name}, {day}', { days: next.left === 1 ? t('day') : t('days'), name: next.name, day: next.day.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' }) }) };
    }
    case 'car': {
      const car = data<CarData>('tessie')?.cars[0];
      if (!car) return car === undefined && data<CarData>('tessie') === undefined ? undefined : null;
      if (which === 'tire') {
        if (!car.tires) return null;
        const [pos, bar] = (Object.entries(car.tires) as [string, number][]).sort((a, b) => a[1] - b[1])[0];
        const names: Record<string, string> = { fl: t('Front left'), fr: t('Front right'), rl: t('Rear left'), rr: t('Rear right') };
        return { value: unit === 'c' ? `${bar.toFixed(1)} bar` : `${Math.round(bar * 14.5038)} psi`, sub: names[pos], tone: softTires(car.tires).length ? 'warn' : undefined };
      }
      if (which === 'range') return { value: unit === 'c' ? `${Math.round(car.rangeMi * 1.609)} km` : `${car.rangeMi} mi`, sub: t('{name} range', { name: car.name }) };
      return { value: `${car.battery}%`, sub: car.charging === 'Charging' ? t('{name}, charging', { name: car.name }) : car.name, tone: car.battery <= 20 ? 'warn' : undefined };
    }
    case 'dns': {
      const d = data<DnsData>('pihole') ?? data<DnsData>('adguard');
      if (!d) return d;
      if (which === 'pct') return { value: `${Math.round(d.pct)}%`, sub: t('of queries blocked today'), tone: d.protecting ? undefined : 'warn' };
      return { value: count(d.blocked), sub: d.protecting ? t('blocked today') : t('blocked today, blocking paused'), tone: d.protecting ? undefined : 'warn' };
    }
    case 'speed': {
      const sp = data<SpeedData>('speedtest');
      const l = sp?.latest;
      if (!l) return l === undefined ? undefined : null;
      const runs = (k: 'down' | 'up' | 'ping', label: string) => ({ data: (sp?.runs ?? []).filter((r) => r[k] != null).map((r) => [r.at, r[k]!] as [number, number]), label, min: 0 });
      if (which === 'up') return { value: count(Math.round(l.up)), sub: t('Mbps up'), line: runs('up', t('Upload, recent tests')) };
      if (which === 'ping') return l.ping == null ? null : { value: count(Math.round(l.ping)), sub: t('ms ping'), line: runs('ping', t('Ping, recent tests')) };
      return { value: count(Math.round(l.down)), sub: t('Mbps down'), tone: l.healthy === false ? 'warn' : undefined, line: runs('down', t('Download, recent tests')) };
    }
    case 'power': {
      const u = data<NutData>('nut')?.ups[0];
      if (!u) return u;
      const tone: Tone = u.lowBattery ? 'crit' : u.onBattery ? 'warn' : undefined;
      if (which === 'runtime') return u.runtimeSec == null ? null : { value: u.runtimeSec >= 3600 ? `${Math.floor(u.runtimeSec / 3600)} h ${Math.round((u.runtimeSec % 3600) / 60)} m` : `${Math.round(u.runtimeSec / 60)} min`, sub: u.onBattery ? t('left, on battery') : t('on battery, if the power goes'), tone };
      if (which === 'load') return u.loadPct == null ? null : { value: `${Math.round(u.loadPct)}%`, sub: t('UPS load') };
      return u.charge == null ? null : { value: `${Math.round(u.charge)}%`, sub: u.onBattery ? t('On battery') : t('On mains'), tone };
    }
    case 'photos': {
      const d = data<ImmichData>('immich');
      if (!d) return d;
      return which === 'videos' ? { value: count(d.videos), sub: t('videos') } : { value: count(d.photos), sub: t('photos') };
    }
    case 'requests': {
      const d = data<SeerrData>('overseerr');
      if (!d) return d;
      return { value: count(d.pending), sub: d.pending === 1 ? t('request waiting') : t('requests waiting'), tone: d.pending ? 'warn' : undefined };
    }
    case 'dockerhosts': {
      const d = data<PortainerData>('portainer');
      if (!d) return d;
      const sum = (k: 'running' | 'unhealthy') => d.envs.reduce((n, e) => n + e[k], 0);
      if (which === 'unhealthy') return { value: count(sum('unhealthy')), sub: t('unhealthy containers'), tone: sum('unhealthy') ? 'warn' : 'ok' };
      return { value: count(sum('running')), sub: t('containers running') };
    }
    case 'network': {
      const d = data<UnifiData>('unifi');
      if (!d) return d;
      return { value: count(d.clients), sub: t('clients online') };
    }
    case 'drives': {
      const d = data<ScrutinyData>('scrutiny');
      if (!d) return d;
      if (which === 'hottest') {
        const hot = d.drives.filter((x) => x.temp != null).sort((a, b) => b.temp! - a.temp!)[0];
        return hot ? { value: `${deg(hot.temp!, unit)}°`, sub: hot.name } : null;
      }
      const bad = d.drives.filter((x) => x.status !== 'ok');
      return { value: count(bad.length), sub: bad.length ? bad.map((x) => x.name).join(', ') : t('All drives healthy'), tone: bad.some((x) => x.status === 'failed') ? 'crit' : bad.length ? 'warn' : 'ok' };
    }
    case 'sync': {
      const d = data<SyncthingData>('syncthing');
      if (!d) return d;
      const behind = d.folders.filter((f) => f.state !== 'idle');
      return { value: count(behind.length), sub: behind.length ? behind.map((f) => f.label).join(', ') : t('Every folder up to date'), tone: behind.some((f) => f.state === 'error' || f.state === 'failing') ? 'warn' : behind.length ? undefined : 'ok' };
    }
    case 'inbox': {
      const d = data<FastmailData>('fastmail');
      if (!d) return d;
      return { value: count(d.unread), sub: t('unread') };
    }
    case 'feeds': {
      const d = data<MinifluxData>('miniflux');
      if (!d) return d;
      return { value: count(d.unread), sub: t('unread articles') };
    }
    case 'managers': {
      const apps = (['lidarr', 'readarr', 'prowlarr', 'bazarr'] as const).map((id) => ({ id, d: data<ArrData>(id), ok: snap.sources[id]?.ok }));
      const on = apps.filter((a) => a.d !== undefined);
      if (!on.length) return null;
      if (which === 'queued') return { value: count(on.reduce((s, a) => s + (a.d?.queueTotal ?? 0), 0)), sub: t('queued or missing subtitles') };
      const bad = on.filter((a) => !a.ok || (a.d?.health.length ?? 0) > 0 || (a.d?.problems.length ?? 0) > 0);
      return { value: count(bad.length), sub: bad.length ? bad.map((a) => a.id.charAt(0).toUpperCase() + a.id.slice(1)).join(', ') : t('All healthy'), tone: bad.length ? 'warn' : 'ok' };
    }
    case 'documents': {
      const d = data<PaperlessData>('paperless');
      if (!d) return d;
      return which === 'total' ? { value: count(d.total), sub: t('documents') } : { value: count(d.inbox), sub: t('in the inbox') };
    }
    case 'nextcloud': {
      const d = data<NextcloudData>('nextcloud');
      if (!d) return d;
      if (which === 'active') return d.activeToday == null ? null : { value: count(d.activeToday), sub: t('of {n} on today', { n: d.users }) };
      if (which === 'free') return d.freeBytes == null ? null : { value: size(d.freeBytes), sub: t('free') };
      return { value: count(d.files), sub: t('files') };
    }
    case 'git': {
      const d = data<GiteaData>('gitea');
      if (!d) return d;
      return which === 'repos' ? { value: count(d.repos), sub: t('repositories') } : { value: count(d.unread), sub: t('notifications') };
    }
    case 'halist':
    case 'climate':
    case 'people': {
      const ha = data<HomeAssistantData>('homeassistant');
      if (!ha) return ha;
      const ids = parseEntities(w.config?.entities, w.type);
      const found = ids.map((id) => ha.entities.find((e) => e.id === id)).filter((e): e is NonNullable<typeof e> => !!e);
      if (!found.length) return null;
      if (w.type === 'halist') return { value: count(Number(found[0].state) || 0), sub: t('to go on {name}', { name: found[0].name }) };
      if (w.type === 'people') {
        const home = found.filter((p) => p.state === 'home');
        return { value: `${home.length}/${found.length}`, sub: home.length ? home.map((p) => p.name).join(', ') : t('No one home') };
      }
      const a = found[0].attrs ?? {};
      return which === 'target' ? (a.target == null ? null : { value: `${a.target}°`, sub: t('{name} set to', { name: found[0].name }) }) : a.current == null ? null : { value: `${Math.round(a.current)}°`, sub: found[0].name };
    }
    case 'monitoring': {
      const lists = [data<MonitorData>('netdata'), data<MonitorData>('prometheus')].filter((x) => x !== undefined);
      if (!lists.length) return null;
      const firing = lists.flatMap((x) => x?.alerts ?? []);
      return { value: count(firing.length), sub: firing.length ? firing[0].name : t('Nothing firing'), tone: firing.some((a) => a.severity === 'critical') ? 'crit' : firing.length ? 'warn' : 'ok' };
    }
  }
  return null;
}

/** A widget as one number, for every type in NUMBERS but Markets, which reads its own prices. */
export function NumberView({ w, now, name }: { w: Widget; now: number; name: string }) {
  const reading = useReading(w, now);
  const which = w.config?.number ?? NUMBERS[w.type]?.[0][0];
  const label = NUMBERS[w.type]?.find(([k]) => k === which)?.[1] ?? name;
  return <OneNumber title={name} label={t(label)} reading={reading} />;
}
