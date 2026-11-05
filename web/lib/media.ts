// Plex (through Tautulli), Jellyfin and Emby behind one hook, so the board's
// media widgets work with whichever servers you run, or all three.

import { dedupeRecent } from '../../shared/media.ts';
import type { MediaServerData, RecentItem, SourceId, TautulliData } from '../../shared/types.ts';
import { useSource, useStore } from './store.tsx';

export interface MediaServer {
  id: SourceId;
  label: string;
  /** The container name its app page lives under. */
  container: string;
  data: TautulliData | MediaServerData;
  /** The app's address from your catalog, when it has one. */
  href?: string;
}

const SERVERS: { id: SourceId; label: string; container: string }[] = [
  { id: 'tautulli', label: 'Plex', container: 'plex' },
  { id: 'jellyfin', label: 'Jellyfin', container: 'jellyfin' },
  { id: 'emby', label: 'Emby', container: 'emby' },
];

export function useMediaServers(): { servers: MediaServer[]; configured: boolean } {
  const plex = useSource<TautulliData>('tautulli');
  const jelly = useSource<MediaServerData>('jellyfin');
  const emby = useSource<MediaServerData>('emby');
  const apps = useStore().snap?.catalog.groups.flatMap((g) => g.services) ?? [];
  const states = [plex, jelly, emby];
  const servers: MediaServer[] = [];
  SERVERS.forEach((s, i) => {
    const data = states[i].data;
    if (!data) return;
    const app = apps.find((a) => a.container === s.container || a.name.toLowerCase() === s.label.toLowerCase());
    const href = app?.href && app.href !== '#' ? app.href.replace(/\/+$/, '') : undefined;
    servers.push({ ...s, data, href });
  });
  return { servers, configured: states.some((s) => s.state) };
}

/** Where a poster opens: the item itself on Jellyfin and Emby, the app on Plex. */
export function itemHref(server: MediaServer, id: string): string | undefined {
  if (!server.href) return undefined;
  const path = (server.data as MediaServerData).itemPath;
  return path ? `${server.href}${path}${encodeURIComponent(id)}` : server.href;
}

export interface MergedItem extends RecentItem {
  server: MediaServer;
  /** Every server that has it, the one the poster opens first. */
  servers?: MediaServer[];
}

/**
 * Newest first across servers. A release two servers both added shows once,
 * opening on the first server with an address, and naming both.
 */
export function mergeRecent(servers: MediaServer[]): MergedItem[] {
  const all = servers.flatMap((server) => server.data.recent.map((r) => ({ ...r, server })));
  return dedupeRecent(all).map(({ item, also }) => {
    const copies = [item, ...also];
    const open = copies.find((c) => c.server.href) ?? item;
    const names = [...new Set(copies.map((c) => c.server))];
    return { ...open, title: item.title, subtitle: item.subtitle, addedAt: item.addedAt, thumb: open.thumb ?? item.thumb, servers: names };
  });
}
