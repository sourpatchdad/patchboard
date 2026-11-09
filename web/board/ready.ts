// Which widgets have something to show: an integration widget is ready once
// its integration is on. The add drawer offers only ready widgets, and a
// starting layout drops the ones that would land empty.

import { type Board, WIDGET_INFO, type WidgetType } from '../../shared/board.ts';
import { NAS_SOURCES, type Snapshot } from '../../shared/types.ts';

export function widgetReady(snap: Snapshot | null | undefined): Partial<Record<WidgetType, boolean>> {
  const has = (id: string) => !!snap?.sources[id as keyof Snapshot['sources']];
  return {
    homeassistant: has('homeassistant'),
    car: has('tessie'),
    uptime: has('uptimekuma') || has('gatus') || has('healthchecks'),
    dns: has('pihole') || has('adguard'),
    speed: has('speedtest'),
    photos: has('immich'),
    proxmox: has('proxmox'),
    drives: has('scrutiny'),
    sync: has('syncthing'),
    hosts: has('glances') || has('beszel'),
    power: has('nut'),
    storage: NAS_SOURCES.some(has),
    dockerhosts: has('portainer'),
    network: has('unifi') || has('tailscale'),
    calendar: has('calendar'),
    books: has('books'),
    requests: has('overseerr'),
    wake: !!snap?.features?.includes('wake'),
    nextup: has('jellyfin') || has('emby'),
    watched: has('tautulli') || has('jellyfin') || has('emby'),
    listening: has('audiobookshelf') || has('navidrome'),
    downloads: ['qbit', 'transmission', 'deluge', 'sabnzbd', 'nzbget', 'sonarr', 'radarr'].some(has),
  };
}

/** What a widget waits for: the integration to name, and the one Settings opens to set it up. */
export const NEEDS: Partial<Record<WidgetType, { label: string; setup: string }>> = {
  homeassistant: { label: 'Home Assistant', setup: 'homeassistant' },
  car: { label: 'Tessie', setup: 'tessie' },
  uptime: { label: 'Uptime Kuma, Gatus or Healthchecks.io', setup: 'uptimekuma' },
  dns: { label: 'Pi-hole or AdGuard Home', setup: 'pihole' },
  speed: { label: 'Speedtest Tracker', setup: 'speedtest' },
  photos: { label: 'Immich', setup: 'immich' },
  proxmox: { label: 'Proxmox', setup: 'proxmox' },
  drives: { label: 'Scrutiny', setup: 'scrutiny' },
  sync: { label: 'Syncthing', setup: 'syncthing' },
  hosts: { label: 'Glances or Beszel', setup: 'glances' },
  power: { label: 'NUT', setup: 'nut' },
  storage: { label: 'Unraid, Synology or QNAP', setup: 'unraid' },
  dockerhosts: { label: 'Portainer', setup: 'portainer' },
  network: { label: 'UniFi or Tailscale', setup: 'unifi' },
  calendar: { label: 'a calendar', setup: 'calendar' },
  books: { label: 'Hardcover or Goodreads', setup: 'hardcover' },
  requests: { label: 'Overseerr or Jellyseerr', setup: 'overseerr' },
  wake: { label: 'Wake-on-LAN machines', setup: 'wake' },
  nextup: { label: 'Jellyfin or Emby', setup: 'jellyfin' },
  downloads: { label: 'a download client, Sonarr or Radarr', setup: 'qbit' },
  watched: { label: 'Plex (Tautulli), Jellyfin or Emby', setup: 'tautulli' },
  listening: { label: 'Audiobookshelf or Navidrome', setup: 'audiobookshelf' },
};

/** Where to set up what a widget needs. */
export const setupHref = (t: WidgetType): string => `/settings?tab=connections&setup=${NEEDS[t]?.setup ?? ''}`;

/** The widgets a layout would drop here, by name, for a note beside it. */
export function leftOut(board: Board, snap: Snapshot | null | undefined): string[] {
  const ready = widgetReady(snap);
  return board.widgets.filter((w) => ready[w.type] === false).map((w) => WIDGET_INFO[w.type].name);
}

/** A starting layout with the widgets that would land empty taken out. */
export function forThisServer(board: Board, snap: Snapshot | null | undefined): Board {
  const ready = widgetReady(snap);
  return { ...structuredClone(board), widgets: board.widgets.filter((w) => ready[w.type] !== false && WIDGET_INFO[w.type]) };
}
