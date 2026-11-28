// Ad blocking: Pi-hole and AdGuard Home. How blocking stands with a timed
// pause, the query log with Allow and Block on each domain, and your own
// lists. The log is read from the blocker while the page is open.

import { type FormEvent, useEffect, useState } from 'react';
import { ConnectOne } from '../components/ConnectOne.tsx';
import { PAGE_SOURCES } from '../../shared/feeds.ts';
import type { DnsBlockedBy, DnsData, DnsLists, DnsLog, DnsQuery } from '../../shared/types.ts';
import { Empty } from '../components/ui.tsx';
import { clock } from '../lib/format.ts';
import { msg, t as tr } from '../lib/i18n.ts';
import { locale } from '../lib/region.ts';
import { ACTION, call, useList } from '../lib/live-list.ts';
import { useSource, useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

type Id = 'pihole' | 'adguard';
const NAMES: Record<Id, string> = { pihole: 'Pi-hole', adguard: 'AdGuard Home' };
type View = 'queries' | 'lists';
const VIEWS: [View, string][] = [
  ['queries', msg('Queries')],
  ['lists', msg('Your lists')],
];
const BY: Record<DnsBlockedBy, string> = {
  list: msg('Blocked by a blocklist'),
  yours: msg('Blocked by your list'),
  rule: msg('Blocked by a rule'),
  upstream: msg('Blocked upstream'),
  service: msg('Blocked service'),
  safety: msg('Blocked by safe browsing'),
};

const SAID = {
  allow: msg('Allowed {domain}.'),
  block: msg('Blocked {domain}.'),
  forget: msg('Took {domain} off your lists.'),
};

export function Blocking() {
  const { snap } = useStore();
  const ro = !!snap?.readOnly;
  const pihole = useSource<DnsData>('pihole');
  const adguard = useSource<DnsData>('adguard');
  const ids = ([['pihole', pihole], ['adguard', adguard]] as const).filter(([, s]) => s.state).map(([id]) => id);
  const [on, setOn] = useUrlChoice<Id>('on', ids, ids[0] ?? 'pihole');
  const [view, setView] = useUrlChoice<View>('view', VIEWS.map((v) => v[0]), 'queries');
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');
  const [lists, setLists] = useState<DnsLists | null>(null);
  const [show, setShow] = useUrlChoice<'all' | 'blocked'>('show', ['all', 'blocked'], 'all');
  const [q, setQ] = useState('');

  useEffect(() => {
    setSaid('');
    setErr('');
  }, [view, on]);
  // Allow and Block in the log need to know what's already on your lists.
  const listed = useList<DnsLists>(ids.length ? `/api/dns/${on}/domains` : null);
  useEffect(() => setLists(listed.data), [listed.data]);

  if (!snap) return <div className="page blocking-page" aria-busy="true" />;
  if (!ids.length)
    return (
      <div className="page blocking-page">
        <div className="page-head">
          <h1 className="page-title">{tr('Ad blocking')}</h1>
        </div>
        <Empty>
          {tr('Pi-hole and AdGuard Home are not set up.')} <ConnectOne sources={PAGE_SOURCES['/blocking']} />
        </Empty>
      </div>
    );

  async function put(domain: string, action: 'allow' | 'block' | 'forget') {
    setSaid('');
    setErr('');
    try {
      const r = await call<{ domain: string }>(`/api/dns/${on}/domains/${action}`, { method: 'POST', headers: ACTION, body: JSON.stringify({ domain }) });
      setSaid(tr(SAID[action], { domain: r.domain }));
      listed.reload();
      return true;
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }

  return (
    <div className="page blocking-page">
      <div className="page-head">
        <h1 className="page-title">{tr('Ad blocking')}</h1>
      </div>
      <ul className="dlp-clients" aria-label={tr('Blockers')}>
        {ids.map((id) => (
          <Status key={id} id={id} data={(id === 'pihole' ? pihole : adguard).data} ro={ro} />
        ))}
      </ul>
      <div className="page-toolbar blk-toolbar">
        <div className="seg" role="group" aria-label={tr('Show')}>
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {tr(label)}
            </button>
          ))}
        </div>
        {view === 'queries' && (
          <div className="seg" role="group" aria-label={tr('Queries')}>
            <button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')}>
              {tr('All')}
            </button>
            <button type="button" aria-pressed={show === 'blocked'} onClick={() => setShow('blocked')}>
              {tr('Blocked')}
            </button>
          </div>
        )}
        {ids.length > 1 && (
          <div className="seg" role="group" aria-label={tr('Blocker')}>
            {ids.map((id) => (
              <button key={id} type="button" aria-pressed={on === id} onClick={() => setOn(id)}>
                {NAMES[id]}
              </button>
            ))}
          </div>
        )}
        {view === 'queries' && <input className="field" type="search" placeholder={tr('Filter by domain')} aria-label={tr('Filter by domain')} value={q} onChange={(e) => setQ(e.target.value)} />}
      </div>
      {said && (
        <p className="req-done" role="status">
          {said}
        </p>
      )}
      {err && (
        <p className="crit-text" role="alert">
          {err}
        </p>
      )}
      {view === 'queries' && <Queries id={on} q={q} blocked={show === 'blocked'} lists={lists} ro={ro} put={put} />}
      {view === 'lists' && <Lists lists={lists} loadErr={listed.err} ro={ro} put={put} />}
    </div>
  );
}

function Status({ id, data, ro }: { id: Id; data: DnsData | null; ro: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!data) return null;
  async function act(action: string) {
    setBusy(true);
    setErr('');
    try {
      await call(`/api/dns/${id}/${action}`, { method: 'POST', headers: ACTION });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const n = (x: number) => x.toLocaleString(locale());
  return (
    <li>
      <strong>{NAMES[id]}</strong>
      <span className={`dlp-client-state ${data.protecting ? '' : 'warn-text'}`}>
        {data.protecting ? tr('{pct}% of {n} queries blocked today', { pct: data.pct, n: n(data.queries) }) : data.resumesAt ? tr('Paused until {time}', { time: clock(data.resumesAt) }) : tr('Off, with no timer')}
      </span>
      {err && <span className="crit-text">{err}</span>}
      {!ro && (
        <span className="dlp-client-actions">
          {data.protecting ? (
            // A group, so a screen reader says "Pause" before "5 min".
            <span className="dlp-pause" role="group" aria-label={tr('Pause')}>
              <span className="lib-total" aria-hidden>{tr('Pause')}</span>
              {[5, 30, 60].map((m) => (
                <button key={m} type="button" className="text-button" disabled={busy} onClick={() => void act(`pause-${m}`)}>
                  {m < 60 ? tr('{n} min', { n: m }) : tr('1 h')}
                </button>
              ))}
            </span>
          ) : (
            <button type="button" className="text-button" disabled={busy} onClick={() => void act('resume')}>
              {tr('Turn back on')}
            </button>
          )}
        </span>
      )}
    </li>
  );
}

function Queries({ id, q, blocked, lists, ro, put }: { id: Id; q: string; blocked: boolean; lists: DnsLists | null; ro: boolean; put: (d: string, a: 'allow' | 'block' | 'forget') => Promise<boolean> }) {
  const [term, setTerm] = useState('');
  // Ask the blocker once typing stops, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = new URLSearchParams();
  if (term) params.set('q', term);
  if (blocked) params.set('blocked', '1');
  const { data, err, reload } = useList<DnsLog>(`/api/dns/${id}/log?${params}`, 10_000);
  const [busy, setBusy] = useState('');

  async function act(qr: DnsQuery, action: 'allow' | 'block') {
    setBusy(qr.domain);
    if (await put(qr.domain, action)) setTimeout(reload, 500);
    setBusy('');
  }

  return (
    <>
      {err ? (
        <p className="crit-text">{err}</p>
      ) : !data ? (
        <div className="dlp-loading" aria-busy="true" />
      ) : !data.queries.length ? (
        <Empty>{term ? tr('No queries match.') : tr('No queries yet.')}</Empty>
      ) : (
        <ul className="lib-list blk-log">
          {data.queries.map((qr) => {
            const allowed = lists?.allow.includes(qr.domain);
            return (
              <li key={qr.id} className={`lib-row no-art ${qr.blocked ? 'is-blocked' : ''}`}>
                <div className="lib-body">
                  <span className="lib-title blk-domain">{qr.domain}</span>
                  <div className="dlp-meta">
                    <span>{qr.client}</span>
                    <span>{clock(qr.at)}</span>
                    {qr.blocked ? <span className="blk-why">{tr(BY[qr.by ?? 'list'])}</span> : allowed && <span>{tr('Allowed by your list')}</span>}
                  </div>
                </div>
                {!ro && (
                  <div className="lib-actions">
                    {qr.blocked ? (
                      <button type="button" className="button button-quiet" disabled={busy === qr.domain} onClick={() => void act(qr, 'allow')}>
                        {tr('Allow')}
                      </button>
                    ) : (
                      !allowed && (
                        <button type="button" className="button button-quiet" disabled={busy === qr.domain} onClick={() => void act(qr, 'block')}>
                          {tr('Block')}
                        </button>
                      )
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function Lists({ lists, loadErr, ro, put }: { lists: DnsLists | null; loadErr: string; ro: boolean; put: (d: string, a: 'allow' | 'block' | 'forget') => Promise<boolean> }) {
  const [domain, setDomain] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent, action: 'allow' | 'block') {
    e.preventDefault();
    if (!domain.trim()) return;
    setBusy(true);
    if (await put(domain, action)) setDomain('');
    setBusy(false);
  }

  if (loadErr) return <p className="crit-text">{loadErr}</p>;
  if (!lists) return <div className="dlp-loading" aria-busy="true" />;
  const section = (title: string, domains: string[]) => (
    <section className="blk-list">
      <h2 className="media-server-name">
        {title} <span className="lib-total">{domains.length}</span>
      </h2>
      {domains.length === 0 ? (
        <Empty>{tr('None yet.')}</Empty>
      ) : (
        <ul className="lib-list">
          {domains.map((d) => (
            <li key={d} className="lib-row no-art">
              <div className="lib-body">
                <span className="lib-title blk-domain">{d}</span>
              </div>
              {!ro && (
                <div className="lib-actions">
                  <button type="button" className="text-button" onClick={() => void put(d, 'forget')}>
                    {tr('Remove')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <>
      {!ro && (
        <form className="blk-add" onSubmit={(e) => void add(e, 'block')}>
          <input className="field" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ads.example.com" aria-label={tr('Domain')} autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode="url" />
          <button type="button" className="button button-quiet" disabled={busy || !domain.trim()} onClick={(e) => void add(e, 'allow')}>
            {tr('Allow')}
          </button>
          <button type="submit" className="button" disabled={busy || !domain.trim()}>
            {tr('Block')}
          </button>
        </form>
      )}
      {section(tr('Allowed'), lists.allow)}
      {section(tr('Blocked'), lists.deny)}
      {!!lists.other && <p className="lib-total">{tr('{n} other rules in AdGuard stay as they are.', { n: lists.other })}</p>}
    </>
  );
}
