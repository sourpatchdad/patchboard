// One Customize panel, the same on every page: sections to show, hide and
// drag into order, and lists of things to hide (feeds, shows, stacks). Saved
// on the server when you press Done, so every device and Home widget follows.

import { useState } from 'react';
import type { PageId, PageSettings } from '../../shared/pages.ts';
import { moved, useDragSort } from '../lib/dragsort.ts';
import { useStore } from '../lib/store.tsx';

export interface SectionDef {
  id: string;
  label: string;
  /** Sections reorder within their group (a page column). */
  group?: string;
}

export interface HideList {
  key: 'hideFeeds' | 'hideCategories' | 'hideShows' | 'hideSources' | 'hideStacks';
  title: string;
  note?: string;
  items: string[];
}

/** This page's saved settings. */
export function usePage(id: PageId): PageSettings {
  return useStore().snap?.pages?.[id] ?? {};
}

export async function savePage(id: PageId, s: PageSettings): Promise<string | null> {
  const res = await fetch(`/api/pages/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Patchboard': 'action' }, body: JSON.stringify(s) });
  return res.ok ? null : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
}

/** The Customize button plus its panel. Hidden in read-only mode. */
export function CustomizePage({ page, title, sections, lists }: { page: PageId; title: string; sections?: SectionDef[]; lists?: HideList[] }) {
  const { snap } = useStore();
  const saved = usePage(page);
  const [open, setOpen] = useState(false);
  if (snap?.readOnly) return null;
  return (
    <>
      <button type="button" className="button button-quiet page-customize" onClick={() => setOpen(true)}>
        Customize
      </button>
      {open && <Panel page={page} title={title} sections={sections ?? []} lists={lists ?? []} saved={saved} onClose={() => setOpen(false)} />}
    </>
  );
}

function Panel({ page, title, sections, lists, saved, onClose }: { page: PageId; title: string; sections: SectionDef[]; lists: HideList[]; saved: PageSettings; onClose: () => void }) {
  const ids = sections.map((s) => s.id);
  const initialOrder = [...(saved.order ?? []).filter((x) => ids.includes(x)), ...ids.filter((x) => !(saved.order ?? []).includes(x))];
  const [order, setOrder] = useState(initialOrder);
  const [hidden, setHidden] = useState(new Set(saved.hidden ?? []));
  const [hides, setHides] = useState<Record<string, Set<string>>>(() => Object.fromEntries(lists.map((l) => [l.key, new Set(saved[l.key] ?? [])])));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const label = (id: string) => sections.find((s) => s.id === id);
  const sameGroup = (a: string, b: string) => label(a)?.group === label(b)?.group;
  const sort = useDragSort('sec', (drag, over) => sameGroup(drag, over) && setOrder((o) => moved(o, o.indexOf(drag), o.indexOf(over))));
  const groups = [...new Set(sections.map((s) => s.group ?? ''))];
  /** Move within the group: to the previous or next section of the same group. */
  const step = (id: string, dir: -1 | 1) =>
    setOrder((o) => {
      const peers = o.filter((x) => sameGroup(x, id));
      const j = peers.indexOf(id) + dir;
      if (j < 0 || j >= peers.length) return o;
      return moved(o, o.indexOf(id), o.indexOf(peers[j]));
    });

  const done = async () => {
    setBusy(true);
    const next: PageSettings = { ...saved, order, hidden: [...hidden] };
    for (const l of lists) next[l.key] = [...hides[l.key]];
    const e = await savePage(page, next);
    setBusy(false);
    if (e) setErr(e);
    else onClose();
  };
  const toggle = (key: string, item: string) =>
    setHides((h) => {
      const s = new Set(h[key]);
      if (s.has(item)) s.delete(item);
      else s.add(item);
      return { ...h, [key]: s };
    });

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer widget-settings page-panel" role="dialog" aria-label={`Customize ${title}`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>Customize {title}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
        </header>

        {sections.length > 0 && (
          <>
            <p className="settings-note">Untick what you don't need; drag to reorder.</p>
            {groups.map((g) => {
              const ids = order.filter((id) => (label(id)?.group ?? '') === g);
              return (
                <div key={g || 'all'}>
                  {g && <h3 className="jw-sub">{g}</h3>}
                  <ul className="sec-list">
                    {ids.map((id, i) => (
                      <li key={id} className={`sec-row ${sort.dragging === id ? 'is-dragging' : ''}`} {...sort.bind(id)}>
                        <span className="grip" data-grip="sec" aria-hidden>
                          ⠿
                        </span>
                        <label className="sec-check">
                          <input
                            type="checkbox"
                            checked={!hidden.has(id)}
                            onChange={() =>
                              setHidden((h) => {
                                const n = new Set(h);
                                if (n.has(id)) n.delete(id);
                                else n.add(id);
                                return n;
                              })
                            }
                          />
                          <span>{label(id)?.label}</span>
                        </label>
                        <span className="arrange-btns">
                          <button type="button" className="cell-btn" disabled={i === 0} onClick={() => step(id, -1)} aria-label={`Move ${label(id)?.label} up`}>
                            ↑
                          </button>
                          <button type="button" className="cell-btn" disabled={i === ids.length - 1} onClick={() => step(id, 1)} aria-label={`Move ${label(id)?.label} down`}>
                            ↓
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}

        {lists.map((l) =>
          l.items.length ? (
            <div key={l.key} className="hide-list">
              <h3 className="jw-sub">{l.title}</h3>
              {l.note && <p className="settings-note">{l.note}</p>}
              <div className="hide-chips">
                {l.items.map((item) => {
                  const on = !hides[l.key].has(item);
                  return (
                    <button key={item} type="button" className={`chip ${on ? '' : 'is-off'}`} aria-pressed={on} onClick={() => toggle(l.key, item)}>
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null,
        )}

        <div className="jw-actions">
          <button type="button" className="button board-save" disabled={busy} onClick={() => void done()}>
            {busy ? 'Saving...' : 'Save'}
          </button>
          {err && <span className="crit-text">{err}</span>}
        </div>
      </div>
    </div>
  );
}
