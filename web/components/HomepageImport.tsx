// Paste (or pick) Homepage's services.yaml and bookmarks.yaml; see what would
// come over as you type; add it beside the apps already in Patchboard.

import { useModal } from '../lib/modal.ts';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { INTEGRATIONS } from '../../shared/integrations.ts';
import { t as tr, tn, tx } from '../lib/i18n.ts';

interface Summary {
  groups: string[];
  apps: number;
  links: number;
  already: number;
  integrations: string[];
  saved?: boolean;
}

async function send(services: string, bookmarks: string, apply: boolean): Promise<Summary> {
  const res = await fetch('/api/catalog/import-homepage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' },
    body: JSON.stringify({ services, bookmarks, apply }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as Summary;
}


export function HomepageImport({ onClose }: { onClose: () => void }) {
  const modal = useModal<HTMLDivElement>(onClose);
  const [services, setServices] = useState('');
  const [bookmarks, setBookmarks] = useState('');
  const [preview, setPreview] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Summary | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Adding removes the Add button, which had focus: hand it to Close, under the result.
  useEffect(() => {
    if (done) closeButton.current?.focus();
  }, [done]);

  // Preview as you paste, a moment after the typing stops.
  useEffect(() => {
    setPreview(null);
    setError('');
    if (!services.trim()) return;
    const t = setTimeout(() => {
      send(services, bookmarks, false).then(setPreview, (e: Error) => setError(e.message));
    }, 350);
    return () => clearTimeout(t);
  }, [services, bookmarks]);

  const pick = async (files: FileList | null) => {
    for (const f of Array.from(files ?? [])) {
      const text = await f.text();
      if (/bookmark/i.test(f.name)) setBookmarks(text);
      else setServices(text);
    }
  };

  const add = async () => {
    setBusy(true);
    try {
      setDone(await send(services, bookmarks, true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const names = (preview ?? done)?.integrations.map((id) => INTEGRATIONS.find((i) => i.id === id)?.name ?? id) ?? [];

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer widget-settings page-panel hp-import" ref={modal} role="dialog" aria-label={tr('Import from Homepage')} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{tr('Import from Homepage')}</h2>
          <button ref={closeButton} type="button" className="text-button" onClick={onClose}>
            {done ? tr('Close') : tr('Cancel')}
          </button>
        </header>

        {done ? (
          <p className="settings-note" role="status">
            {tx('Added {what}. {link}, where Edit apps moves, renames and hides them.', {
              what: done.links ? tr('{apps} and {links}', { apps: tn(done.apps, '{n} app', '{n} apps'), links: tn(done.links, '{n} link', '{n} links') }) : tn(done.apps, '{n} app', '{n} apps'),
              link: <Link to="/apps">{tr('See them on Apps')}</Link>,
            })}
          </p>
        ) : (
          <>
            <p className="settings-note">
              {tx("Paste {file} from Homepage's config folder, or choose the files. Apps, groups, icons, descriptions and links come over. Widget blocks stay behind with their keys.", { file: <code>services.yaml</code> })}
            </p>
            <label className="field-label">
              <span>services.yaml</span>
              <textarea className="field mono" rows={9} value={services} onChange={(e) => setServices(e.target.value)} placeholder={'- Media:\n    - Plex:\n        href: http://192.168.1.10:32400/web\n        icon: plex.png'} spellCheck={false} />
            </label>
            <label className="field-label">
              <span>{tr('bookmarks.yaml, if you have one')}</span>
              <textarea className="field mono" rows={4} value={bookmarks} onChange={(e) => setBookmarks(e.target.value)} spellCheck={false} />
            </label>
            <label className="hp-files">
              <span className="text-button">{tr('Choose files')}</span>
              <input type="file" accept=".yaml,.yml,text/yaml" multiple onChange={(e) => void pick(e.target.files)} />
            </label>

            {error && <p className="crit-text" role="alert">{error}</p>}
            {preview && (
              <div className="adopt">
                <p>
                  {preview.apps || preview.links ? (
                    <strong>
                      {tr('{apps} in {groups}', { apps: tn(preview.apps, '{n} new app', '{n} new apps'), groups: tn(preview.groups.length, '{n} group', '{n} groups') })}
                      {preview.links ? `, ${tn(preview.links, '{n} link', '{n} links')}` : ''}.
                    </strong>
                  ) : (
                    <strong>{tr('Nothing new: Patchboard has every app here.')}</strong>
                  )}{' '}
                  {preview.already > 0 && `${tn(preview.already, '{n} app is already here and stays as it is.', '{n} apps are already here and stay as they are.')} `}
                  {preview.groups.length > 0 && tr('Groups: {names}.', { names: preview.groups.join(', ') })}
                </p>
                <button type="button" className="button" disabled={busy || !(preview.apps || preview.links)} onClick={() => void add()}>
                  {busy ? tr('Adding...') : tr('Add to Patchboard')}
                </button>
              </div>
            )}
          </>
        )}
        {names.length > 0 && (
          <p className="settings-note">
            {names.length === 1
              ? tr('Homepage had a widget for {names}. Connect it from its tile in Apps for live numbers and alerts.', { names: names[0] })
              : tr('Homepage had widgets for {names}. Connect each from its tile in Apps for live numbers and alerts.', { names: names.join(', ') })}
          </p>
        )}
      </div>
    </div>
  );
}
