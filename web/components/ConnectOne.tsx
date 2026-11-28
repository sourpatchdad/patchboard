// "Connect one": what a page or widget does when none of the services that
// feed it is connected yet. One service opens its connection right here; for
// several, it asks which one you run, with the ones running here first. Every
// empty page and the widget gallery use this, so nothing points at a list the
// service isn't on.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sourceOf } from '../../shared/feeds.ts';
import { INTEGRATIONS, type Integration } from '../../shared/integrations.ts';
import type { Service, Snapshot } from '../../shared/types.ts';
import { integrationOf } from '../lib/connect.ts';
import { t } from '../lib/i18n.ts';
import { useModal } from '../lib/modal.ts';
import { containerMap } from '../lib/services.ts';
import { useStore } from '../lib/store.tsx';
import { appLike, ServiceSheet } from './ServiceSheet.tsx';

/** The sources whose app runs in a container here, by the container's name. */
export function runningHere(snap: Snapshot | null | undefined): Set<string> {
  return new Set(
    [...containerMap(snap ?? null).values()]
      .filter((c) => c.state === 'running')
      .map((c) => integrationOf({ name: c.name, container: c.name } as Service)?.id)
      .filter((x): x is string => !!x)
      .map(sourceOf),
  );
}

/** The services that can feed these sources, the ones running here first. */
export function providersFor(sources: string[], snap: Snapshot | null | undefined): { list: Integration[]; running: Set<string> } {
  const running = runningHere(snap);
  const list = INTEGRATIONS.filter((i) => sources.includes(sourceOf(i.id))).sort(
    // The catalog's own order after that: the main apps (Plex, Jellyfin) before the rarer ones.
    (a, b) => Number(running.has(sourceOf(b.id))) - Number(running.has(sourceOf(a.id))),
  );
  return { list, running };
}

/** Which of several services you run: a short list, the ones running here marked. */
export function WhichOne({ list, running, onPick, onClose }: { list: Integration[]; running: Set<string>; onPick: (id: string) => void; onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer" ref={modal} role="dialog" aria-label={t('Which do you run?')} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{t('Which do you run?')}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            {t('Close')}
          </button>
        </header>
        <ul className="drawer-list">
          {list.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => onPick(i.id)}>
                <strong>{i.name}</strong>
                <span>{running.has(sourceOf(i.id)) ? t('Running here') : t(i.adds)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * A "Connect" action for these sources. A service that isn't an app (TrueNAS,
 * Docker) links to its row in Settings; the rest set up in place.
 */
export function ConnectOne({ sources, label, className = 'text-button', onSaved }: { sources: string[]; /** Translated already; "Connect one" by default. */ label?: string; className?: string; onSaved?: () => void }) {
  const { snap } = useStore();
  const [choosing, setChoosing] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const { list, running } = providersFor(sources, snap);
  if (!list.length || snap?.readOnly) return null;
  const inPlace = list.filter(appLike);
  if (!inPlace.length)
    return (
      <Link className={className === 'text-button' ? undefined : className} to={`/settings?tab=connections&setup=${list[0].id}`}>
        {label ?? t('Connect one')}
      </Link>
    );
  return (
    <>
      <button type="button" className={className} onClick={() => (inPlace.length > 1 ? setChoosing(true) : setId(inPlace[0].id))}>
        {label ?? t('Connect one')}
      </button>
      {choosing && !id && <WhichOne list={inPlace} running={running} onPick={setId} onClose={() => setChoosing(false)} />}
      {id && (
        <ServiceSheet
          id={id}
          connect
          onSaved={() => {
            setId(null);
            setChoosing(false);
            onSaved?.();
          }}
          onClose={() => setId(null)}
        />
      )}
    </>
  );
}
