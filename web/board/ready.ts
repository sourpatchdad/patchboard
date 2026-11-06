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
  };
}

/** A starting layout with the widgets that would land empty taken out. */
export function forThisServer(board: Board, snap: Snapshot | null | undefined): Board {
  const ready = widgetReady(snap);
  return { ...structuredClone(board), widgets: board.widgets.filter((w) => ready[w.type] !== false && WIDGET_INFO[w.type]) };
}
