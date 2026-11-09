// Demo fixtures for the server side of Patchboard: compose metadata, container
// stats, TrueNAS, inspect detail, runbook sections and chart history. Kept apart
// from demo.ts (media, mail, feeds) so each file stays readable.

import { demoStartedAt, demoStoppedAt } from './demo.ts';
import { readPath, type JsonWidgetConfig } from '../shared/jsonwidget.ts';
import type { BackupRun, BackupsData, Catalog, ChecksData, Container, ContainerDetail, RunbookSection, StatsData, TruenasData } from '../shared/types.ts';

const H = 3_600_000;
const D = 24 * H;
const GiB = 2 ** 30;
const TiB = 2 ** 40;
const jitter = (base: number, spread: number) => base + (Math.random() - 0.5) * 2 * spread;

export function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return h;
}

export const PROJECTS: Record<string, string> = {
  plex: 'media', jellyfin: 'media', tautulli: 'media', audiobookshelf: 'media', navidrome: 'media',
  sonarr: 'arr', radarr: 'arr', prowlarr: 'arr', bazarr: 'arr', qbittorrent: 'arr', sabnzbd: 'arr', unpackerr: 'arr', recyclarr: 'arr',
  'immich-server': 'immich', 'immich-postgres': 'immich', 'immich-redis': 'immich',
  frigate: 'home', homeassistant: 'home', mosquitto: 'home',
  nextcloud: 'nextcloud', paperless: 'paperless',
  miniflux: 'tools', linkding: 'tools', dozzle: 'tools', diun: 'tools', vaultwarden: 'tools', 'uptime-kuma': 'tools',
  patchboard: 'patchboard',
  cloudflared: 'edge', caddy: 'edge',
};

export const DEPENDS: Record<string, string[]> = {
  'immich-server': ['immich-postgres', 'immich-redis'],
  homeassistant: ['mosquitto'],
  frigate: ['mosquitto'],
  unpackerr: ['sonarr', 'radarr'],
};

export const IMAGES: Record<string, string> = {
  plex: 'plexinc/pms-docker:latest',
  jellyfin: 'jellyfin/jellyfin:latest',
  'immich-server': 'ghcr.io/immich-app/immich-server:release',
  'immich-postgres': 'ghcr.io/immich-app/postgres:15-vectorchord0.4',
  'immich-redis': 'valkey/valkey:9',
  frigate: 'ghcr.io/blakeblackshear/frigate:stable',
  homeassistant: 'ghcr.io/home-assistant/home-assistant:stable',
  mosquitto: 'eclipse-mosquitto:2',
  cloudflared: 'cloudflare/cloudflared:latest',
  caddy: 'caddy:2',
  vaultwarden: 'vaultwarden/server:latest',
  'uptime-kuma': 'louislam/uptime-kuma:2',
  patchboard: 'patchboard:1.1.0',
  paperless: 'ghcr.io/paperless-ngx/paperless-ngx:latest',
  dozzle: 'amir20/dozzle:latest',
  diun: 'crazymax/diun:latest',
  miniflux: 'miniflux/miniflux:latest',
  linkding: 'sissbruecker/linkding:latest',
};

// Typical load per container: [cpu % of the machine, memory MB].
const LOAD: Record<string, [number, number]> = {
  sabnzbd: [1.6, 310], plex: [3.4, 1480], jellyfin: [2.1, 760], frigate: [6.2, 1210], 'immich-server': [1.1, 910], 'immich-postgres': [0.4, 640],
  homeassistant: [0.9, 520], nextcloud: [0.3, 410], paperless: [0.2, 760], qbittorrent: [1.8, 690],
  sonarr: [0.4, 330], radarr: [0.3, 360], prowlarr: [0.1, 210], bazarr: [0.2, 240], audiobookshelf: [0.1, 180],
  vaultwarden: [0.02, 40], caddy: [0.1, 45], cloudflared: [0.2, 38], patchboard: [0.3, 96],
};

export function demoLoad(name: string, at = Date.now()): { cpu: number; memBytes: number } {
  const h = Math.abs(hash(name));
  const [cpu, mb] = LOAD[name] ?? [0.05 + (h % 30) / 100, 30 + (h % 220)];
  // A slow daily swell plus noise, so sparklines have something to say.
  const phase = Math.sin((at / D) * 2 * Math.PI + (h % 7));
  return {
    cpu: Math.max(0, cpu * (1 + 0.35 * phase) + (Math.random() - 0.5) * cpu * 0.5),
    memBytes: mb * 1e6 * (1 + 0.04 * phase) + Math.random() * mb * 1e4,
  };
}

export function demoStats(containers: Container[]): StatsData {
  const out: StatsData['containers'] = {};
  for (const c of containers) if (c.state === 'running') out[c.name] = demoLoad(c.name);
  return { containers: out };
}

export function demoTruenas(): TruenasData {
  const disks = ['sda', 'sdb', 'sdc', 'sdd', 'sde', 'sdf'];
  const size = 43.6 * TiB;
  const used = 0.872 * size;
  return {
    hostname: 'tank',
    version: 'TrueNAS-25.10.5',
    pools: [
      {
        name: 'tank',
        status: 'ONLINE',
        healthy: true,
        sizeBytes: size,
        usedBytes: used,
        freeBytes: size - used,
        usedPct: 87.2,
        layout: 'RAIDZ2',
        disks: disks.map((d) => ({ name: d, status: 'ONLINE', errors: 0 })),
        scan: { kind: 'SCRUB', state: 'FINISHED', startedAt: Date.now() - 3 * D - 14 * H, endedAt: Date.now() - 3 * D, errors: 0 },
      },
    ],
    disks: [
      ...disks.map((name, i) => ({
        name,
        model: 'WDC WD80EFZZ-68BTXN0',
        sizeBytes: 8e12,
        type: 'HDD',
        pool: 'tank',
        tempC: [35, 36, 38, 37, 41, 36][i],
      })),
      { name: 'nvme0n1', model: 'Samsung SSD 980 500GB', sizeBytes: 500e9, type: 'SSD', pool: null, tempC: 44 },
    ],
    datasets: [
      { name: 'tank/media', usedBytes: 24.8 * TiB },
      { name: 'tank/photos', usedBytes: 6.1 * TiB },
      { name: 'tank/backups', usedBytes: 3.9 * TiB },
      { name: 'tank/cameras', usedBytes: 1.6 * TiB },
      { name: 'tank/apps', usedBytes: 0.9 * TiB },
      { name: 'tank/documents', usedBytes: 0.3 * TiB },
    ],
    snapshots: 412,
    alerts: [{ id: 'demo-upd', level: 'NOTICE', text: 'TrueNAS 25.10.6 is available for download.', at: Date.now() - 2 * D }],
    cloudSync: [
      { name: 'Backblaze B2: photos and documents', enabled: true, state: 'SUCCESS', finishedAt: Date.now() - 5 * H, error: null },
      { name: 'Backblaze B2: app configs', enabled: true, state: 'SUCCESS', finishedAt: Date.now() - 5 * H - 20 * 60_000, error: null },
    ],
    net: [{ iface: 'eno1', rx: jitter(2.4e6, 1.2e6), tx: jitter(0.6e6, 0.3e6) }],
  };
}

export function demoMem() {
  return { total: 64 * GiB, available: (19.5 + Math.random() * 0.4) * GiB, arc: 30 * GiB };
}

const PORTS: Record<string, string> = {
  plex: '32400/tcp', jellyfin: '8096/tcp', sonarr: '8989/tcp', radarr: '7878/tcp', prowlarr: '9696/tcp', bazarr: '6767/tcp',
  qbittorrent: '8080/tcp', sabnzbd: '8080/tcp', tautulli: '8181/tcp', 'immich-server': '2283/tcp', frigate: '5000/tcp',
  homeassistant: '8123/tcp', nextcloud: '80/tcp', miniflux: '8080/tcp', vaultwarden: '80/tcp', patchboard: '3200/tcp',
};

export function demoInspect(name: string, all: Container[]): ContainerDetail | null {
  const c = all.find((x) => x.name === name);
  if (!c) return null;
  const running = c.state === 'running';
  const port = PORTS[name];
  const media = PROJECTS[name] === 'arr' || PROJECTS[name] === 'media';
  return {
    name,
    id: c.id,
    image: c.image,
    imageId: Math.abs(hash(c.image)).toString(16).padStart(12, '0').slice(0, 12),
    imageCreated: Date.now() - 9 * D,
    created: c.created ?? Date.now() - 6 * D,
    startedAt: running ? (demoStartedAt[name] ?? c.created ?? Date.now() - 6 * D) : null,
    finishedAt: running ? null : (demoStoppedAt[name] ?? Date.now() - 9 * H),
    exitCode: running ? null : name === 'unpackerr' ? 1 : 0,
    restartCount: name === 'unpackerr' ? 3 : 0,
    restartPolicy: name === 'recyclarr' ? 'no' : 'unless-stopped',
    state: c.state,
    health: c.health,
    healthLog: c.health ? [{ at: Date.now() - 20_000, exitCode: 0, output: '' }] : [],
    project: c.project,
    service: c.service,
    workingDir: c.project ? `/mnt/tank/compose/${c.project}` : undefined,
    ports: port ? [{ container: port, host: port.split('/')[0] }] : [],
    mounts: [
      { source: `/mnt/tank/apps/${name}`, target: '/config', rw: true, type: 'bind' },
      ...(media ? [{ source: '/mnt/tank/media', target: '/media', rw: true, type: 'bind' }] : []),
      ...(name === 'patchboard' ? [{ source: '/var/run/docker.sock', target: '/var/run/docker.sock', rw: false, type: 'bind' }] : []),
    ],
    networks: [`${c.project ?? 'bridge'}_default`],
    dependsOn: c.dependsOn ?? [],
    usedBy: all.filter((x) => x.dependsOn?.includes(name)).map((x) => x.name),
  };
}

const RUNBOOK: RunbookSection[] = [
  {
    title: 'Unpackerr Not Running',
    markdown: [
      "Unpackerr exits when it can't read the download folder. The usual cause is a permissions change after a qBittorrent update.",
      '',
      '```bash',
      '# Check the last error',
      'sudo docker logs --tail 50 unpackerr',
      '',
      '# Confirm the download folder is readable by the container user',
      'sudo ls -ld /mnt/tank/media/downloads/complete',
      '',
      '# Fix ownership, then start it again',
      'sudo chown -R apps:apps /mnt/tank/media/downloads/complete',
      'sudo docker start unpackerr',
      '```',
      '',
      'If it exits again within a minute, check that **Sonarr** and **Radarr** are both up: Unpackerr polls both on start.',
    ].join('\n'),
  },
  {
    title: 'Immich Unresponsive',
    markdown: [
      'Immich depends on its Postgres and Redis containers. Restart from the bottom up.',
      '',
      '```bash',
      'cd /mnt/tank/compose/immich',
      'sudo docker compose restart immich-postgres',
      '# Wait for healthy status, then:',
      'sudo docker compose restart immich-server',
      '```',
    ].join('\n'),
  },
  {
    title: 'Plex Transcoding Stalls',
    markdown: [
      'Usually the transcode directory filled up. It lives on the NVMe, not the pool.',
      '',
      '```bash',
      'sudo du -sh /mnt/fast/plex-transcode',
      'sudo docker restart plex',
      '```',
    ].join('\n'),
  },
];

export function demoRunbook(name: string): RunbookSection[] {
  const app = name.split('-')[0];
  return RUNBOOK.filter((s) => s.title.toLowerCase().startsWith(app));
}

/** A day of samples and three months of pool growth, so charts aren't empty. */
export function demoSampleHistory(containers: Container[], record: (at: number, values: [string, number][]) => void): void {
  const now = Date.now();
  const running = containers.filter((c) => c.state === 'running');
  for (let t = now - D; t < now; t += 2 * 60_000) {
    const phase = Math.sin((t / D) * 2 * Math.PI);
    const values: [string, number][] = [
      ['cpu', Math.max(2, 14 + 6 * phase + (Math.random() - 0.5) * 8)],
      ['mem.used', (14.5 + 0.8 * phase + Math.random() * 0.3) * GiB],
      ['mem.arc', 30 * GiB],
    ];
    for (const c of running) {
      const l = demoLoad(c.name, t);
      values.push([`ctr.cpu:${c.name}`, l.cpu], [`ctr.mem:${c.name}`, l.memBytes]);
    }
    record(t, values);
  }
  for (let t = now - D; t < now; t += 5 * 60_000) {
    const vals: [string, number][] = [];
    for (const name of ['Plex', 'Sonarr', 'Radarr', 'Immich', 'Frigate', 'Nextcloud', 'Miniflux']) {
      const base = 8 + (Math.abs(hash(name)) % 40);
      vals.push([`svc.ms:${name}`, Math.max(2, base + (Math.random() - 0.3) * base * 0.6)]);
    }
    record(t, vals);
  }
  const size = 43.6 * TiB;
  for (let d = 90; d >= 1; d--) {
    const used = size * (0.872 - d * 0.00062) + (Math.random() - 0.5) * 0.05 * TiB;
    record(now - d * D, [
      ['pool.used', used],
      ['pool.size', size],
    ]);
  }
}

/** Every linked service answers quickly, except Paperless, which serves 502s. */
export function demoChecks(catalog: Catalog): ChecksData {
  const services: ChecksData['services'] = {};
  for (const s of catalog.groups.flatMap((g) => g.services)) {
    if (!s.href || !s.container) continue;
    const h = Math.abs(hash(s.name));
    const port = 3000 + (h % 6000);
    if (s.name === 'Paperless') {
      services[s.name] = { name: s.name, target: `10.0.0.20:${port}`, ok: false, status: 502, ms: 41, at: Date.now(), fails: 4, error: 'HTTP 502' };
      continue;
    }
    if (s.container === 'unpackerr' || s.container === 'recyclarr') continue;
    services[s.name] = { name: s.name, target: `10.0.0.20:${port}`, ok: true, status: 200, ms: Math.round(jitter(8 + (h % 40), 4)), at: Date.now(), fails: 0 };
  }
  return { services };
}

const DB_LABELS = ['Immich', 'Nextcloud', 'Miniflux', 'Paperless', 'Vaultwarden', 'Linkding'];
const FILE_LABELS = ['Frigate config', 'Mosquitto config/data', 'Home Assistant', 'TrueNAS system config', 'Cron definitions'];

export function demoBackups(): BackupsData {
  const runs = (labels: string[], minute: number, failOn: Record<number, string>): BackupRun[] => {
    const out: BackupRun[] = [];
    for (let d = 13; d >= 0; d--) {
      const day = new Date();
      day.setDate(day.getDate() - d);
      day.setHours(1, minute, 0, 0);
      if (day.getTime() > Date.now()) continue;
      out.push({
        startedAt: day.getTime(),
        finishedAt: day.getTime() + 2 * 60_000,
        items: labels.map((label) => ({ label, ok: failOn[d] !== label })),
        stored: 30 * labels.length,
        size: labels.length > 5 ? '9.4G' : '1.1G',
      });
    }
    return out;
  };
  return { db: runs(DB_LABELS, 0, { 6: 'Nextcloud', 7: 'Nextcloud' }), files: runs(FILE_LABELS, 30, { 11: 'Home Assistant' }) };
}

/** Demo: an invented JSON document, so the API numbers widget has something to map. */
const DEMO_JSON = {
  status: 'ok',
  queries: { today: 48213, blocked: 6120, blockedPercent: 12.7 },
  clients: { active: 23 },
  gravity: { domains: 1284033, updated: Math.floor(Date.now() / 1000) - 26 * 3600 },
  uptimeSeconds: 864000 + 3600 * 7,
  memory: { usedBytes: 412_000_000 },
};

export function demoJson(cfg: JsonWidgetConfig, withSample = false) {
  return {
    values: cfg.fields.map((f) => ({ label: f.label, value: readPath(DEMO_JSON, f.path) ?? null })),
    at: Date.now(),
    sample: withSample ? JSON.stringify(DEMO_JSON, null, 2) : undefined,
  };
}

/** Demo: a steady, made-up number for an app's live number. */
export function demoAppStat(name: string, cfg: JsonWidgetConfig): { values: { label: string; value: unknown }[]; at: number; error?: string } {
  let h = 0;
  for (const ch of name + cfg.fields[0]?.path) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const f = cfg.fields[0];
  const n = Math.abs(h);
  const value = f?.format === 'percent' ? (n % 900) / 10 : f?.format === 'bytes' ? (n % 4000) * 1e9 : f?.format === 'duration' ? n % 500000 : n % 50000;
  return { values: [{ label: f?.label ?? '', value }], at: Date.now() };
}
