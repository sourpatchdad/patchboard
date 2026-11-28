// Connect an *arr app without copying its API key: read the key from the
// app's own settings file, through the Docker API Patchboard already holds.
//
// The bounds, because this reads another app's secret:
// - Only the apps listed here, only the one settings file each, and only
//   from a running container whose image or name is that app's.
// - Docker hands the file over as a tar stream; at most MAX_BYTES of it is
//   read, and only a 32-character hex ApiKey is taken from it. Nothing else
//   in the file is kept, logged or returned.
// - The key never reaches a browser: the route that calls this tests it,
//   seals it into the encrypted store, and answers with the outcome only.
// - The key only ever goes to an address Docker says is that container:
//   its name on a network Patchboard shares, or its published port on the
//   Docker host (the gateway, loopback, or a configured remote host). The
//   caller never supplies the address, so it can't be sent anywhere else.
// - It runs when someone presses the button, never on its own, and the
//   audit log records who did it and from which container (not the key).

import http from 'node:http';
import { targetOf } from './adapters/docker.ts';
import { config } from './config.ts';
import { whoAmI } from './updater.ts';
import type { Container } from '../shared/types.ts';
import { KEY_FIND_APPS } from '../shared/setup.ts';

/** Each app's settings file, how its image or container is named, and the port it listens on inside. */
const HOMES: Record<(typeof KEY_FIND_APPS)[number], { file: string; is: RegExp; port: number }> = {
  sonarr: { file: '/config/config.xml', is: /sonarr/i, port: 8989 },
  radarr: { file: '/config/config.xml', is: /radarr/i, port: 7878 },
  lidarr: { file: '/config/config.xml', is: /lidarr/i, port: 8686 },
  readarr: { file: '/config/config.xml', is: /readarr/i, port: 8787 },
  prowlarr: { file: '/config/config.xml', is: /prowlarr/i, port: 9696 },
};

/** The parts of `docker inspect` that say where a container can be reached. */
export interface Reach {
  Name: string;
  HostConfig?: { NetworkMode?: string };
  NetworkSettings?: {
    Networks?: Record<string, { IPAddress?: string; Gateway?: string } | null> | null;
    Ports?: Record<string, { HostIp?: string; HostPort?: string }[] | null> | null;
  };
}

const ANY = new Set(['', '0.0.0.0', '::', '[::]']);

/**
 * Every address that is this container, by Docker's own account, in the
 * order worth trying: its name where Patchboard shares a network with it,
 * then its published port through the Docker host. `self` is Patchboard's
 * own container, or null when it runs outside Docker; `remote` is the
 * configured address of the Docker host the app runs on, if not this one.
 */
export function addressesFor(id: string, app: Reach, self: Reach | null, remote?: string): string[] {
  if (!canFindKey(id)) return [];
  const port = HOMES[id].port;
  const name = app.Name.replace(/^\//, '');
  const out: string[] = [];
  const hostMode = app.HostConfig?.NetworkMode === 'host';
  const published = (app.NetworkSettings?.Ports?.[`${port}/tcp`] ?? []).filter((b) => /^\d{1,5}$/.test(b.HostPort ?? ''));
  if (remote) {
    for (const b of published) out.push(`http://${remote}:${b.HostPort}`);
    if (hostMode) out.push(`http://${remote}:${port}`);
    return [...new Set(out)];
  }
  const mine = Object.entries(self?.NetworkSettings?.Networks ?? {});
  const theirs = new Set(Object.keys(app.NetworkSettings?.Networks ?? {}));
  if (!hostMode && mine.some(([n]) => theirs.has(n))) out.push(`http://${name}:${port}`);
  // Through the host: loopback when Patchboard shares the host's network or runs outside Docker, else its gateways.
  const selfHost = !self || self.HostConfig?.NetworkMode === 'host';
  const hosts = selfHost ? ['127.0.0.1'] : mine.map(([, n]) => n?.Gateway).filter((g): g is string => !!g && /^[\d.]+$/.test(g));
  for (const b of published) {
    // Bound to one address: that address is the host's own.
    if (!ANY.has(b.HostIp ?? '') && /^[\d.]+$/.test(b.HostIp ?? '')) out.push(`http://${b.HostIp}:${b.HostPort}`);
    else for (const h of hosts) out.push(`http://${h}:${b.HostPort}`);
  }
  if (hostMode) for (const h of hosts) out.push(`http://${h}:${port}`);
  return [...new Set(out)];
}

async function inspectReach(name: string): Promise<Reach> {
  const { target, bare } = targetOf(name);
  return new Promise((resolve, reject) => {
    const req = http.get({ ...target, path: `/containers/${encodeURIComponent(bare)}/json` }, (res) => {
      if ((res.statusCode ?? 500) >= 400) return (res.resume(), reject(new Error(`Docker ${res.statusCode}`)));
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Reach);
        } catch (err) {
          reject(err as Error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('Docker took too long to answer.')));
  });
}

/** Where to reach this container from Patchboard, by asking Docker about both. */
export async function keyAddresses(id: string, container: string): Promise<string[]> {
  const { host } = targetOf(container);
  const remote = host ? config.dockerHosts.find((h) => h.name === host)?.host : undefined;
  const app = await inspectReach(container);
  const me = remote ? null : await whoAmI();
  const self = me ? await inspectReach(me).catch(() => null) : null;
  return addressesFor(id, app, self, remote);
}

/** A settings file is a few kilobytes; anything past this is not one. */
export const MAX_BYTES = 256 * 1024;
const BLOCK = 512;

export const canFindKey = (id: string): id is keyof typeof HOMES => Object.hasOwn(HOMES, id);

/** The container to read from: it must exist, run, and be this app. Else why not. */
export function keyContainer(id: string, name: unknown, containers: Container[]): { container: Container } | { error: string } {
  if (!canFindKey(id)) return { error: "Patchboard can't read this app's key. Paste it instead." };
  const c = typeof name === 'string' ? containers.find((x) => x.name === name) : undefined;
  if (!c) return { error: 'No container by that name.' };
  if (c.state !== 'running') return { error: `${c.name} isn't running, so its settings can't be read.` };
  if (!HOMES[id].is.test(c.image) && !HOMES[id].is.test(c.name)) return { error: `${c.name} doesn't look like ${id[0].toUpperCase()}${id.slice(1)}.` };
  return { container: c };
}

/**
 * The first regular file in a tar archive, or null. Handles the PAX and GNU
 * long-name entries Docker may put first; refuses anything past MAX_BYTES.
 */
export function firstFile(tar: Buffer): Buffer | null {
  let at = 0;
  while (at + BLOCK <= tar.length) {
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((b) => b === 0)) return null;
    const size = parseInt(header.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim() || '0', 8);
    if (!Number.isFinite(size) || size < 0 || size > MAX_BYTES) return null;
    const type = String.fromCharCode(header[156] || 48);
    const start = at + BLOCK;
    if (type === '0' && start + size <= tar.length) return tar.subarray(start, start + size);
    // Metadata entries (x, g, L, K) and anything else: skip past their data.
    at = start + Math.ceil(size / BLOCK) * BLOCK;
  }
  return null;
}

/** The ApiKey in an *arr config.xml: 32 hex characters, nothing else accepted. */
export function apiKeyIn(xml: string): string | null {
  return /<ApiKey>\s*([0-9a-f]{32})\s*<\/ApiKey>/i.exec(xml)?.[1].toLowerCase() ?? null;
}

/** Read the app's settings file out of its container and return its key. */
export async function findKey(id: string, container: string): Promise<string> {
  if (!canFindKey(id)) throw new Error("Patchboard can't read this app's key.");
  const { target, bare } = targetOf(container);
  const path = `/containers/${encodeURIComponent(bare)}/archive?path=${encodeURIComponent(HOMES[id].file)}`;
  const tar = await new Promise<Buffer>((resolve, reject) => {
    const req = http.get({ ...target, path }, (res) => {
      if (res.statusCode === 404) return (res.resume(), reject(new Error(`No settings file at ${HOMES[id].file} in ${container}. Paste the key instead.`)));
      if (res.statusCode === 403) return (res.resume(), reject(new Error('Docker refused to hand over the file. A socket proxy needs ARCHIVE allowed for this; or paste the key.')));
      if ((res.statusCode ?? 500) >= 400) return (res.resume(), reject(new Error(`Docker couldn't read ${container}'s settings (${res.statusCode}). Paste the key instead.`)));
      const chunks: Buffer[] = [];
      let got = 0;
      res.on('data', (chunk: Buffer) => {
        got += chunk.length;
        // The archive carries one small file: a big one is not what we asked for.
        if (got > MAX_BYTES + 4 * BLOCK) return req.destroy(new Error('That settings file is too large to be one. Paste the key instead.'));
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', (err: NodeJS.ErrnoException) => reject(new Error(err.code === 'ENOENT' ? 'Docker socket not mounted' : err.message)));
    req.setTimeout(8000, () => req.destroy(new Error('Docker took too long to hand over the file.')));
  });
  const file = firstFile(tar);
  const key = file ? apiKeyIn(file.toString('utf8')) : null;
  if (!key) throw new Error(`No API key in ${container}'s settings yet. Open it once to make one, or paste the key.`);
  return key;
}
