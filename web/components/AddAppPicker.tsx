// Add an app: one searchable list of everything Patchboard can add. What's
// running here and not listed yet comes first, then every app Patchboard
// knows how to connect, by kind, then a link to anything else. Picking a
// known app opens its sheet with the connection ready to fill in, so adding
// Sonarr and connecting Sonarr are one step, not two screens.

import { useState } from 'react';
import { sourceOf, WIDGET_SOURCES } from '../../shared/feeds.ts';
import { WIDGET_INFO, type WidgetType } from '../../shared/board.ts';
import { appLike } from './ServiceSheet.tsx';
import { CATEGORIES, INTEGRATIONS, type Integration } from '../../shared/integrations.ts';
import { UI_SETUP } from '../../shared/setup.ts';
import type { Service } from '../../shared/types.ts';
import { iconFor, integrationOf, isConnected } from '../lib/connect.ts';
import { t } from '../lib/i18n.ts';
import { useModal } from '../lib/modal.ts';
import { useStore } from '../lib/store.tsx';
import { Icon } from './ui.tsx';

/** Ways to be told about trouble, not apps: they belong with Alerts. */
const NOT_APPS = new Set(CATEGORIES.find(([name]) => name === 'Notifications')?.[1] ?? []);
/**
 * Services with nothing to open: they feed a widget, so they're connected from
 * its Add widget card or from Settings, Connections, never added as an app.
 */
const NOT_TILES = new Set(['weather', 'calendar', 'trakt', 'hardcover', 'goodreads', 'wake', 'dockerhosts']);

export interface Running {
  name: string;
  icon?: string;
  href?: string;
  container: string;
}

export function AddAppPicker({ listed, running, onPick, onOpen, onClose }: { listed: Service[]; running: Running[]; onPick: (app: Service) => void; /** An app already on Apps: open its own sheet. */ onOpen?: (app: Service) => void; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  const { snap } = useStore();
  const [find, setFind] = useState('');
  const q = find.trim().toLowerCase();
  const match = (...words: (string | undefined)[]) => !q || words.some((w) => w?.toLowerCase().includes(q));
  // An app already on Apps opens from its tile; it isn't offered twice.
  // Compared by source, so a Plex tile (read through Tautulli's place) covers Plex too.
  const covered = new Set(listed.map((s) => integrationOf(s)?.id).filter((id): id is string => !!id).map(sourceOf));
  const known = (ids: string[]) =>
    ids
      .map((id) => INTEGRATIONS.find((i) => i.id === id))
      .filter((i): i is Integration => !!i && UI_SETUP.has(i.id) && !NOT_APPS.has(i.id) && !NOT_TILES.has(i.id) && !covered.has(sourceOf(i.id)) && match(i.name, i.adds));
  const here = running.filter((r) => match(r.name, r.container));
  // A running container already offered above isn't offered again by name (Pihole and Pi-hole).
  for (const r of running) {
    const i = integrationOf({ name: r.name, container: r.container, icon: r.icon } as Service);
    if (i) covered.add(sourceOf(i.id));
  }
  const kinds = CATEGORIES.filter(([name]) => name !== 'Notifications')
    .map(([name, ids]) => [name, known(ids)] as const)
    .filter(([, list]) => list.length);
  // A widget by name or what it shows ("bambu", "printer"), with the app that feeds it.
  const widgets = q
    ? (Object.keys(WIDGET_INFO) as WidgetType[])
        .map((w) => ({ w, feeds: INTEGRATIONS.filter((i) => appLike(i) && (WIDGET_SOURCES[w] ?? []).includes(sourceOf(i.id))) }))
        .filter(({ w, feeds }) => feeds.length > 0 && match(WIDGET_INFO[w].name, WIDGET_INFO[w].about))
    : [];
  const listedFor = (i: Integration) => listed.find((s) => { const x = integrationOf(s); return !!x && sourceOf(x.id) === sourceOf(i.id); });
  const nothing = !here.length && !kinds.length && !widgets.length;

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer add-app" ref={modal} role="dialog" aria-label={t('Add an app')} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{t('Add an app')}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            {t('Cancel')}
          </button>
        </header>
        <input className="field" type="search" value={find} autoFocus placeholder={t('Find an app')} aria-label={t('Find an app')} onChange={(e) => setFind(e.target.value)} />
        <div className="add-app-list">
          {here.length > 0 && (
            <section>
              <h3>{t('Running here, not listed yet')}</h3>
              <ul>
                {here.map((r) => (
                  <li key={r.container}>
                    <button type="button" className="add-app-row" onClick={() => onPick({ name: r.name, icon: r.icon, href: r.href, container: r.container, source: 'ui' })}>
                      <Icon name={r.name} icon={r.icon} size={24} />
                      <span className="add-app-name">{r.name}</span>
                      <span className="add-app-note mono">{r.container}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {kinds.map(([name, list]) => (
            <section key={name}>
              <h3>{t(name)}</h3>
              <ul>
                {list.map((i) => (
                  <li key={i.id}>
                    <button type="button" className="add-app-row" onClick={() => onPick({ name: i.name, source: 'ui' })}>
                      <Icon name={i.name} icon={iconFor(i)} size={24} />
                      <span className="add-app-name">{i.name}</span>
                      {snap && isConnected(snap, i) && <span className="add-app-note">{t('Connected')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {widgets.length > 0 && (
            <section>
              <h3>{t('Widgets')}</h3>
              <ul>
                {widgets.flatMap(({ w, feeds }) =>
                  feeds.map((i) => {
                    const app = listedFor(i);
                    return (
                      <li key={`${w}-${i.id}`}>
                        <button type="button" className="add-app-row" onClick={() => (app && onOpen ? onOpen(app) : onPick({ name: i.name, source: 'ui' }))}>
                          <Icon name={i.name} icon={iconFor(i)} size={24} />
                          <span className="add-app-name">{t(WIDGET_INFO[w].name)}</span>
                          <span className="add-app-note">{t('through {name}', { name: i.name })}</span>
                        </button>
                      </li>
                    );
                  }),
                )}
              </ul>
            </section>
          )}
          {nothing && <p className="empty">{t('Nothing called that. Add it as a link below.')}</p>}
        </div>
        <footer className="add-app-foot">
          <button type="button" className="button button-quiet" onClick={() => onPick({ name: find.trim(), source: 'ui' })}>
            {t('Something else: any site, by its link')}
          </button>
        </footer>
      </div>
    </div>
  );
}
