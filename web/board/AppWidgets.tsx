// Widgets for the apps that had only a number on their tile: the rest of the
// *arr family with Bazarr, Paperless-ngx, Nextcloud, Gitea or Forgejo, and the
// alerts firing in Netdata or Prometheus. Each reads the source its tile
// already reads, so turning one on costs no extra requests.

import type { ArrData, GiteaData, MonitorAlert, MonitorData, NextcloudData, PaperlessData } from '../../shared/types.ts';
import { Empty, Section } from '../components/ui.tsx';
import { agoLong, size } from '../lib/format.ts';
import { locale } from '../lib/region.ts';
import { useSource } from '../lib/store.tsx';
import { useWidget } from './widget-context.ts';

const n = (v: number) => v.toLocaleString(locale());

/** Lidarr, Readarr, Prowlarr and Bazarr, one line each: what's wrong first, then what's queued. */
export function ManagersWidget() {
  const apps = [
    { id: 'lidarr', name: 'Lidarr', what: 'in the queue', s: useSource<ArrData>('lidarr') },
    { id: 'readarr', name: 'Readarr', what: 'in the queue', s: useSource<ArrData>('readarr') },
    { id: 'prowlarr', name: 'Prowlarr', what: '', s: useSource<ArrData>('prowlarr') },
    { id: 'bazarr', name: 'Bazarr', what: 'missing subtitles', s: useSource<ArrData>('bazarr') },
  ].filter((a) => a.s.state);
  if (!apps.length) return null;
  const trouble = apps.filter((a) => !a.s.state?.ok || (a.s.data?.health.length ?? 0) > 0 || (a.s.data?.problems.length ?? 0) > 0).length;
  return (
    <Section title="Media managers" className="managers" count={trouble ? `${trouble} ${trouble === 1 ? 'needs' : 'need'} you` : 'all well'}>
      <ul className="app-rows">
        {apps.map(({ id, name, what, s }) => {
          const d = s.data;
          const down = !s.state?.ok;
          const warn = d?.health.find((h) => h.level !== 'notice') ?? d?.health[0];
          const stuck = d?.problems.length ?? 0;
          return (
            <li key={id} className={down || warn || stuck ? 'is-trouble' : undefined}>
              <span className="app-row-name">{name}</span>
              <span className={`app-row-state ${down ? 'crit-text' : warn || stuck ? 'warn-text' : ''}`} title={warn?.message}>
                {down ? "Can't reach it" : warn ? warn.message : stuck ? `${stuck} stuck` : 'Healthy'}
              </span>
              <span className="app-row-num mono">{d && what ? `${n(d.queueTotal)} ${what}` : ''}</span>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** Paperless-ngx: documents waiting in the inbox, and how many there are in all. */
export function DocumentsWidget() {
  const { state, data } = useSource<PaperlessData>('paperless');
  if (!state || !data) return null;
  return (
    <Section title="Documents" source={state} className="documents" action={{ label: 'Open Paperless', href: data.inbox ? `${data.webUrl}/documents?is_in_inbox=1` : data.webUrl }}>
      <div className="speed-nums">
        <p>
          <span className="speed-big">{n(data.inbox)}</span>
          <span className="speed-unit">in the inbox</span>
        </p>
        <p>
          <span className="speed-mid">{n(data.total)}</span>
          <span className="speed-unit">documents</span>
        </p>
      </div>
      <p className="speed-seen">{data.inbox ? 'Waiting to be tagged and filed.' : 'Everything is filed.'}</p>
    </Section>
  );
}

/** Nextcloud: files and people, free space, and app updates waiting. */
export function NextcloudWidget() {
  const { state, data } = useSource<NextcloudData>('nextcloud');
  if (!state || !data) return null;
  return (
    <Section title="Nextcloud" source={state} className="nextcloud" action={{ label: 'Open Nextcloud', href: data.webUrl }}>
      <div className="speed-nums">
        <p>
          <span className="speed-big">{n(data.files)}</span>
          <span className="speed-unit">files</span>
        </p>
        <p>
          <span className="speed-mid">{data.activeToday ?? data.users}</span>
          <span className="speed-unit">{data.activeToday != null ? `of ${data.users} ${data.users === 1 ? 'person' : 'people'} on today` : data.users === 1 ? 'person' : 'people'}</span>
        </p>
        {data.freeBytes != null && (
          <p>
            <span className="speed-mid">{size(data.freeBytes)}</span>
            <span className="speed-unit">free</span>
          </p>
        )}
      </div>
      <p className="speed-seen">
        {data.appUpdates ? (
          <a className="warn-text" href={`${data.webUrl}/settings/apps/updates`} target="_blank" rel="noreferrer">
            {data.appUpdates} app {data.appUpdates === 1 ? 'update' : 'updates'} waiting
          </a>
        ) : (
          'Apps up to date'
        )}
        {data.version ? `. Nextcloud ${data.version}` : ''}
      </p>
    </Section>
  );
}

/** Gitea or Forgejo: notifications waiting, and the repositories it holds. */
export function GitWidget() {
  const { state, data } = useSource<GiteaData>('gitea');
  if (!state || !data) return null;
  return (
    <Section title="Git" source={state} className="git" action={data.unread ? { label: 'Notifications', href: `${data.webUrl}/notifications` } : { label: 'Repositories', href: data.webUrl }}>
      <div className="speed-nums">
        <p>
          <span className="speed-big">{n(data.unread)}</span>
          <span className="speed-unit">{data.unread === 1 ? 'notification' : 'notifications'}</span>
        </p>
        <p>
          <span className="speed-mid">{n(data.repos)}</span>
          <span className="speed-unit">{data.repos === 1 ? 'repository' : 'repositories'}</span>
        </p>
      </div>
    </Section>
  );
}

/** Netdata and Prometheus: the alerts firing now, critical first, each linking back to where it fired. */
export function MonitoringWidget({ now }: { now: number }) {
  const nd = useSource<MonitorData>('netdata');
  const pr = useSource<MonitorData>('prometheus');
  const { limit = 6 } = useWidget();
  const sources = [nd, pr].filter((s) => s.state);
  if (!sources.length) return null;
  const all: (MonitorAlert & { href: string })[] = sources.flatMap((s) => (s.data?.alerts ?? []).map((a) => ({ ...a, href: s.data!.webUrl })));
  all.sort((a, b) => (a.severity === b.severity ? (b.since ?? 0) - (a.since ?? 0) : a.severity === 'critical' ? -1 : 1));
  const names = [nd.state && 'Netdata', pr.state && 'Prometheus'].filter(Boolean).join(' and ');
  return (
    <Section title="Monitoring alerts" source={sources[0].state} className="monitoring" count={all.length ? `${all.length} firing` : undefined}>
      {all.length === 0 ? (
        <Empty>Nothing firing in {names}.</Empty>
      ) : (
        <ul className="app-rows">
          {all.slice(0, limit).map((a) => (
            <li key={a.id} className="is-trouble">
              <a className="app-row-name" href={a.href} target="_blank" rel="noreferrer">
                {a.name}
              </a>
              <span className={`app-row-state ${a.severity === 'critical' ? 'crit-text' : 'warn-text'}`} title={a.detail}>{[a.instance, a.detail].filter(Boolean).join(', ') || (a.severity === 'critical' ? 'Critical' : 'Warning')}</span>
              <span className="app-row-num mono">{a.since ? agoLong(a.since, now) : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
