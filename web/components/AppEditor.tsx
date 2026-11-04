// Editing apps: everything about what's on the Apps page and Home's Apps
// widget, without touching services.yaml. Drag apps to reorder or into
// another group, drag groups by their grip, rename groups in place, hide or
// show anything, add apps (or adopt running containers in one click), and
// give anything an icon, including an uploaded one. Nothing is saved until
// Save; the result is one layout stored on the server.

import { useMemo, useRef, useState } from 'react';
import type { AddedApp, AppOrder } from '../../shared/order.ts';
import { orderOf } from '../../shared/order.ts';
import type { Bookmark, Catalog, DiscoveredService, Service } from '../../shared/types.ts';
import { moved, useDragSort } from '../lib/dragsort.ts';
import { Icon } from './ui.tsx';

export interface EditGroup {
  key: string;
  name: string;
  /** The name the group had when editing began. */
  from?: string;
  services: Service[];
}

export interface Draft {
  groups: EditGroup[];
  hidden: { group: string; service: Service }[];
  dock: Bookmark[];
  hiddenDock: Bookmark[];
  icons: Record<string, string>;
}

let seq = 0;
const key = () => `g${++seq}`;

export function draftFrom(cat: Catalog): Draft {
  return {
    groups: cat.groups.map((g) => ({ key: key(), name: g.name, from: g.name, services: g.services })),
    hidden: cat.hiddenApps ?? [],
    dock: cat.dock,
    hiddenDock: cat.hiddenDock ?? [],
    icons: { ...(cat.iconOverrides ?? {}) },
  };
}

/** The layout to save. */
export function layoutOf(d: Draft, prevRenamed?: Record<string, string>): AppOrder {
  const groups = d.groups.map((g) => ({ ...g, name: g.name.trim() }));
  const base = orderOf(groups, prevRenamed);
  const added: AddedApp[] = groups.flatMap((g) =>
    g.services
      .filter((s) => s.source === 'ui')
      .map((s) => ({ name: s.name, group: g.name, href: s.href, icon: s.icon, container: s.container, description: s.description })),
  );
  const hidden = [...d.hidden.map((h) => h.service.name), ...d.hiddenDock.map((b) => b.name)];
  return { ...base, hidden, icons: d.icons, added };
}

/** Problems that would stop a save, in plain words. */
export function draftProblem(d: Draft): string | null {
  const names = d.groups.map((g) => g.name.trim());
  if (names.some((n) => !n)) return 'Every group needs a name.';
  if (new Set(names).size !== names.length) return 'Two groups have the same name.';
  return null;
}

const SOURCE: Record<string, string> = { yaml: 'From services.yaml', labels: 'From a Docker label', ui: 'Added here' };

export function EditApps({
  draft,
  onChange,
  discovered,
  containers,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  discovered: DiscoveredService[];
  containers: string[];
}) {
  const [form, setForm] = useState<{ app: Service; group: string; isNew: boolean } | null>(null);
  const groups = draft.groups;
  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });
  const setGroups = (gs: EditGroup[]) => set({ groups: gs });
  const where = (name: string) => {
    for (let gi = 0; gi < groups.length; gi++) {
      const i = groups[gi].services.findIndex((s) => s.name === name);
      if (i >= 0) return { gi, i };
    }
    return null;
  };

  /** Move app (gi, i) to group tg at ti (end when omitted). */
  const moveApp = (gi: number, i: number, tg: number, ti?: number) => {
    if (tg < 0 || tg >= groups.length) return;
    if (gi === tg) {
      const list = groups[gi].services;
      const to = ti ?? list.length - 1;
      if (to < 0 || to >= list.length || to === i) return;
      setGroups(groups.map((g, j) => (j === gi ? { ...g, services: moved(list, i, to) } : g)));
      return;
    }
    const app = groups[gi].services[i];
    setGroups(
      groups.map((g, j) => {
        if (j === gi) return { ...g, services: g.services.filter((_, k) => k !== i) };
        if (j === tg) {
          const next = [...g.services];
          next.splice(ti ?? next.length, 0, app);
          return { ...g, services: next };
        }
        return g;
      }),
    );
  };

  const apps = useDragSort('app', (drag, over) => {
    const from = where(drag);
    if (!from) return;
    if (over.startsWith('@')) {
      const tg = groups.findIndex((g) => g.key === over.slice(1));
      if (tg >= 0 && tg !== from.gi) moveApp(from.gi, from.i, tg);
      return;
    }
    const to = where(over);
    if (to) moveApp(from.gi, from.i, to.gi, to.i);
  });
  const grp = useDragSort(
    'group',
    (drag, over) => {
      const a = groups.findIndex((g) => g.key === drag);
      const b = groups.findIndex((g) => g.key === over);
      if (a >= 0 && b >= 0) setGroups(moved(groups, a, b));
    },
    { gripOnly: true },
  );

  const hide = (gi: number, i: number) => {
    const s = groups[gi].services[i];
    set({
      groups: groups.map((g, j) => (j === gi ? { ...g, services: g.services.filter((_, k) => k !== i) } : g)),
      hidden: [...draft.hidden, { group: groups[gi].name, service: s }],
    });
  };
  const unhide = (n: number) => {
    const h = draft.hidden[n];
    let gi = groups.findIndex((g) => g.name === h.group);
    const gs = gi >= 0 ? groups : [...groups, { key: key(), name: h.group, services: [] }];
    if (gi < 0) gi = gs.length - 1;
    set({
      groups: gs.map((g, j) => (j === gi ? { ...g, services: [...g.services, h.service] } : g)),
      hidden: draft.hidden.filter((_, k) => k !== n),
    });
  };
  const addGroup = () => {
    let n = 1;
    const label = () => (n === 1 ? 'New group' : `New group ${n}`);
    while (groups.some((g) => g.name === label())) n++;
    setGroups([...groups, { key: key(), name: label(), services: [] }]);
  };
  const allNames = useMemo(
    () => new Set([...groups.flatMap((g) => g.services.map((s) => s.name)), ...draft.hidden.map((h) => h.service.name)]),
    [groups, draft.hidden],
  );
  const dupes = new Set(groups.map((g) => g.name.trim()).filter((n, i, all) => all.indexOf(n) !== i));
  const listed = new Set(groups.flatMap((g) => g.services.map((s) => s.container)).filter(Boolean));
  const adoptable = discovered.filter((d) => !listed.has(d.container) && !allNames.has(d.name));

  const action = (gi: number, i: number, v: string) => {
    const s = groups[gi].services[i];
    if (v === 'edit') setForm({ app: s, group: groups[gi].name, isNew: false });
    else if (v === 'hide') hide(gi, i);
    else if (v === 'delete') setGroups(groups.map((g, j) => (j === gi ? { ...g, services: g.services.filter((_, k) => k !== i) } : g)));
    else if (v === 'up') moveApp(gi, i, gi, i - 1);
    else if (v === 'down') moveApp(gi, i, gi, i + 1);
    else if (v.startsWith('to:')) moveApp(gi, i, Number(v.slice(3)));
  };

  return (
    <div className={`tiles tiles-large tiles-arranging ${apps.dragging || grp.dragging ? 'is-dragging-any' : ''}`}>
      {groups.map((g, gi) => (
        <section className={`tile-group ${grp.dragging === g.key ? 'is-dragging' : ''}`} key={g.key} aria-label={g.name} {...grp.bind(g.key)}>
          <header className="tile-group-head arrange-head" data-app={`@${g.key}`}>
            <span className="arrange-name">
              <span className="grip" data-grip="group" title="Drag to move this group" aria-hidden>
                ⠿
              </span>
              <input
                className={`field group-name ${dupes.has(g.name.trim()) || !g.name.trim() ? 'is-bad' : ''}`}
                value={g.name}
                maxLength={60}
                aria-label="Group name"
                onChange={(e) => setGroups(groups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)))}
              />
            </span>
            <span className="arrange-btns">
              <button type="button" className="cell-btn" disabled={gi === 0} onClick={() => setGroups(moved(groups, gi, gi - 1))} aria-label={`Move ${g.name} up`}>
                ↑
              </button>
              <button type="button" className="cell-btn" disabled={gi === groups.length - 1} onClick={() => setGroups(moved(groups, gi, gi + 1))} aria-label={`Move ${g.name} down`}>
                ↓
              </button>
              <button type="button" className="cell-btn" onClick={() => setForm({ app: { name: '', source: 'ui' }, group: g.name, isNew: true })} aria-label={`Add an app to ${g.name}`} title="Add an app here">
                +
              </button>
              {g.services.length === 0 && (
                <button type="button" className="cell-btn cell-remove" onClick={() => setGroups(groups.filter((_, j) => j !== gi))} aria-label={`Remove the empty group ${g.name}`}>
                  ×
                </button>
              )}
            </span>
          </header>
          <ul className="tile-grid" data-app={`@${g.key}`}>
            {g.services.length === 0 && <li className="tile-drop">Drag apps here</li>}
            {g.services.map((s, i) => (
              <li key={s.name} className={`tile tile-arrange ${apps.dragging === s.name ? 'is-dragging' : ''}`} data-tone="none" {...apps.bind(s.name)}>
                <span className="grip tile-grip" data-grip="app" aria-hidden>
                  ⠿
                </span>
                <span className="tile-main">
                  <span className="tile-icon">
                    <Icon name={s.name} icon={s.icon} size={24} />
                  </span>
                  <span className="tile-name">{s.name}</span>
                  <span className="tile-stat">{SOURCE[s.source ?? 'yaml']}</span>
                </span>
                <span className="cell-btn move-to tile-menu" title="Edit, hide or move">
                  ⋯
                  <select aria-label={`${s.name}: edit, hide or move`} value="" onChange={(e) => action(gi, i, e.target.value)}>
                    <option value="" disabled>
                      {s.name}
                    </option>
                    <option value="edit">{s.source === 'ui' ? 'Edit...' : 'Change icon...'}</option>
                    {s.source === 'ui' ? <option value="delete">Delete</option> : <option value="hide">Hide</option>}
                    {i > 0 && <option value="up">Move earlier</option>}
                    {i < g.services.length - 1 && <option value="down">Move later</option>}
                    {groups.length > 1 && (
                      <optgroup label="Move to">
                        {groups.map((x, j) =>
                          j === gi ? null : (
                            <option key={x.key} value={`to:${j}`}>
                              {x.name || 'Unnamed group'}
                            </option>
                          ),
                        )}
                      </optgroup>
                    )}
                  </select>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="tile-group edit-extras">
        <span />
        <div className="edit-actions">
          <button type="button" className="button button-quiet" onClick={addGroup}>
            New group
          </button>
          <button type="button" className="button button-quiet" onClick={() => setForm({ app: { name: '', source: 'ui' }, group: groups[0]?.name ?? 'Apps', isNew: true })}>
            Add an app
          </button>
        </div>
      </div>

      {adoptable.length > 0 && (
        <EditSection title="Running, not listed yet" note="Containers on this server that no app points at. Add one to put it on the board.">
          {adoptable.map((d) => (
            <li className="tile tile-arrange" data-tone="none" key={d.container}>
              <span className="tile-main">
                <span className="tile-icon">
                  <Icon name={d.name} icon={d.icon} size={24} />
                </span>
                <span className="tile-name">{d.name}</span>
                <span className="tile-stat mono">{d.container}</span>
              </span>
              <button
                type="button"
                className="cell-btn tile-add"
                onClick={() => setForm({ app: { name: d.name, icon: d.icon, href: d.href, container: d.container, source: 'ui' }, group: groups[0]?.name ?? 'Apps', isNew: true })}
              >
                Add
              </button>
            </li>
          ))}
        </EditSection>
      )}

      {(draft.dock.length > 0 || draft.hiddenDock.length > 0) && (
        <EditSection title="Bookmarks" note="Links from the dock list in services.yaml. Hide any you don't want under Elsewhere.">
          {draft.dock.map((b, i) => (
            <li className="tile tile-arrange" data-tone="none" key={b.name}>
              <span className="tile-main">
                <span className="tile-icon">
                  <Icon name={b.name} icon={b.icon} size={24} />
                </span>
                <span className="tile-name">{b.name}</span>
                <span className="tile-stat">Bookmark</span>
              </span>
              <button
                type="button"
                className="cell-btn tile-add"
                onClick={() => set({ dock: draft.dock.filter((_, k) => k !== i), hiddenDock: [...draft.hiddenDock, b] })}
              >
                Hide
              </button>
            </li>
          ))}
        </EditSection>
      )}

      {(draft.hidden.length > 0 || draft.hiddenDock.length > 0) && (
        <EditSection title="Hidden" note="Not shown on Home, Apps or in search. A hidden app's container still raises an alert if it stops.">
          {draft.hidden.map((h, n) => (
            <li className="tile tile-arrange is-hidden" data-tone="none" key={h.service.name}>
              <span className="tile-main">
                <span className="tile-icon">
                  <Icon name={h.service.name} icon={h.service.icon} size={24} />
                </span>
                <span className="tile-name">{h.service.name}</span>
                <span className="tile-stat">{h.group}</span>
              </span>
              <button type="button" className="cell-btn tile-add" onClick={() => unhide(n)}>
                Show
              </button>
            </li>
          ))}
          {draft.hiddenDock.map((b, n) => (
            <li className="tile tile-arrange is-hidden" data-tone="none" key={`dock-${b.name}`}>
              <span className="tile-main">
                <span className="tile-icon">
                  <Icon name={b.name} icon={b.icon} size={24} />
                </span>
                <span className="tile-name">{b.name}</span>
                <span className="tile-stat">Bookmark</span>
              </span>
              <button
                type="button"
                className="cell-btn tile-add"
                onClick={() => set({ hiddenDock: draft.hiddenDock.filter((_, k) => k !== n), dock: [...draft.dock, b] })}
              >
                Show
              </button>
            </li>
          ))}
        </EditSection>
      )}

      {form && (
        <AppForm
          app={form.app}
          group={form.group}
          isNew={form.isNew}
          groups={groups.map((g) => g.name)}
          containers={containers}
          taken={(n) => n !== form.app.name && allNames.has(n)}
          onClose={() => setForm(null)}
          onSave={(app, group) => {
            if (app.source !== 'ui') {
              // Catalog apps: only the icon changes, kept as an override.
              const icons = { ...draft.icons };
              if (app.icon) icons[app.name] = app.icon;
              else delete icons[app.name];
              set({ icons, groups: groups.map((g) => ({ ...g, services: g.services.map((s) => (s.name === app.name ? { ...s, icon: app.icon } : s)) })) });
            } else {
              let gs = groups.map((g) => ({ ...g, services: g.services.filter((s) => s.name !== form.app.name || form.isNew) }));
              let gi = gs.findIndex((g) => g.name === group);
              if (gi < 0) {
                gs = [...gs, { key: key(), name: group, services: [] }];
                gi = gs.length - 1;
              }
              const old = !form.isNew ? groups.find((g) => g.name === form.group)?.services.findIndex((s) => s.name === form.app.name) : -1;
              gs = gs.map((g, j) => {
                if (j !== gi) return g;
                const next = [...g.services];
                if (old != null && old >= 0 && g.name === form.group) next.splice(old, 0, app);
                else next.push(app);
                return { ...g, services: next };
              });
              set({ groups: gs });
            }
            setForm(null);
          }}
        />
      )}
    </div>
  );
}

function EditSection({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="tile-group edit-section">
      <header className="tile-group-head">
        <h3>{title}</h3>
      </header>
      <div>
        <p className="settings-note edit-note">{note}</p>
        <ul className="tile-grid">{children}</ul>
      </div>
    </section>
  );
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Add or edit one app. Catalog apps can only change their icon here. */
function AppForm({
  app,
  group,
  isNew,
  groups,
  containers,
  taken,
  onClose,
  onSave,
}: {
  app: Service;
  group: string;
  isNew: boolean;
  groups: string[];
  containers: string[];
  taken: (name: string) => boolean;
  onClose: () => void;
  onSave: (app: Service, group: string) => void;
}) {
  const ours = app.source === 'ui';
  const [v, setV] = useState<Service>(app);
  const [g, setG] = useState(group);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const autoIcon = slug(v.name);

  const upload = async (f: File) => {
    setErr('');
    if (f.size > 512 * 1024) return setErr('Icons can be up to 512 KB.');
    setBusy(true);
    try {
      const res = await fetch('/api/icons', { method: 'POST', headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-Patchboard': 'action' }, body: f });
      const body = (await res.json()) as { icon?: string; error?: string };
      if (!res.ok || !body.icon) setErr(body.error ?? `Upload failed (HTTP ${res.status})`);
      else setV({ ...v, icon: body.icon });
    } catch {
      setErr('Upload failed.');
    }
    setBusy(false);
  };

  const done = () => {
    const name = v.name.trim();
    if (ours) {
      if (!name) return setErr('Give it a name.');
      if (taken(name)) return setErr(`There's already an app called ${name}.`);
      if (v.href) {
        try {
          if (!['http:', 'https:'].includes(new URL(v.href).protocol)) throw new Error();
        } catch {
          return setErr('The link needs to start with http:// or https://');
        }
      }
      if (!g.trim()) return setErr('Pick a group.');
    }
    onSave({ ...v, name, icon: v.icon?.trim() || (ours ? autoIcon || undefined : undefined), href: v.href?.trim() || undefined, container: v.container || undefined }, g.trim());
  };

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div className="palette drawer widget-settings" role="dialog" aria-label={isNew ? 'Add an app' : `Edit ${app.name}`} onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <h2>{isNew ? 'Add an app' : ours ? `Edit ${app.name}` : app.name}</h2>
          <button type="button" className="text-button" onClick={onClose}>
            Cancel
          </button>
        </header>
        {!ours && <p className="settings-note">This app comes from {app.source === 'labels' ? 'a Docker label' : 'services.yaml'}. Its name and link are set there; its icon you can change here.</p>}
        <div className="ws-form">
          {ours && (
            <>
              <label>
                <span>Name</span>
                <input className="field" value={v.name} maxLength={60} autoFocus placeholder="Jellyfin" onChange={(e) => setV({ ...v, name: e.target.value })} />
              </label>
              <label>
                <span>Link, opened when you click it</span>
                <input className="field mono" value={v.href ?? ''} placeholder="https://jellyfin.example.com" onChange={(e) => setV({ ...v, href: e.target.value })} />
              </label>
              <label>
                <span>Container, for its status, logs and actions</span>
                <select className="field" value={v.container ?? ''} onChange={(e) => setV({ ...v, container: e.target.value || undefined })}>
                  <option value="">None, it's just a link</option>
                  {containers.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Group</span>
                <input className="field" list="pb-groups" value={g} placeholder="Pick or type a new one" onChange={(e) => setG(e.target.value)} />
                <datalist id="pb-groups">
                  {groups.map((x) => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
            </>
          )}
          <div className="ws-row">
            <span>Icon</span>
            <div className="icon-pick">
              <span className="icon-preview">
                <Icon key={v.icon ?? autoIcon} name={v.name || '?'} icon={v.icon || (ours ? autoIcon : app.icon)} size={40} />
              </span>
              <input
                className="field mono"
                value={v.icon ?? ''}
                placeholder={ours ? `${autoIcon || 'name'} (matched by name)` : 'Leave empty to use the catalog icon'}
                aria-label="Icon name or URL"
                onChange={(e) => setV({ ...v, icon: e.target.value || undefined })}
              />
              <button type="button" className="button button-quiet" disabled={busy} onClick={() => file.current?.click()}>
                {busy ? 'Uploading...' : 'Upload'}
              </button>
              <input
                ref={file}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif,image/x-icon"
                onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
              />
            </div>
            <span className="settings-note">
              A name from <a href="https://dashboardicons.com" target="_blank" rel="noreferrer">dashboard icons</a> (like <code>jellyfin</code>), any image URL, or your own file.
            </span>
          </div>
        </div>
        <div className="jw-actions">
          <button type="button" className="button board-save" onClick={done}>
            {isNew ? 'Add' : 'Done'}
          </button>
          {err && <span className="crit-text">{err}</span>}
        </div>
      </div>
    </div>
  );
}
