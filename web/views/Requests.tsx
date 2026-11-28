// Requests: Overseerr or Jellyseerr. Every request waiting for approval,
// everything approved and on the way, and asking for something new.
// Lists come straight from the app while the page is open.

import { useEffect, useState } from 'react';
import { ConnectOne } from '../components/ConnectOne.tsx';
import { PAGE_SOURCES } from '../../shared/feeds.ts';
import type { AskItem, RequestList, SeerrData, SeerrRequest } from '../../shared/types.ts';
import { HoldButton } from '../components/Hold.tsx';
import { Empty, PosterRow as Row } from '../components/ui.tsx';
import { agoLong } from '../lib/format.ts';
import { msg, t as tr } from '../lib/i18n.ts';
import { ACTION, call, useList } from '../lib/live-list.ts';
import { useStore } from '../lib/store.tsx';
import { useUrlChoice } from '../lib/url.ts';

type View = 'waiting' | 'coming' | 'ask';
const VIEWS: [View, string][] = [
  ['waiting', msg('Waiting')],
  ['coming', msg('On the way')],
  ['ask', msg('New request')],
];

/** "Season 2", "Seasons 1 to 3", or "4 seasons" when they skip. */
function seasons(s: number[]): string {
  if (s.length === 1) return tr('Season {n}', { n: s[0] });
  const sorted = [...s].sort((a, b) => a - b);
  const run = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return run ? tr('Seasons {from} to {to}', { from: sorted[0], to: sorted[sorted.length - 1] }) : tr('{n} seasons', { n: s.length });
}

export function Requests() {
  const { snap } = useStore();
  const ro = !!snap?.readOnly;
  // Opens on what needs you, or else on what's moving: an empty Waiting tab
  // over 15 requests on the way says nothing.
  const live = (snap?.sources.overseerr?.data as SeerrData | null | undefined) ?? null;
  const start: View = !live?.pending && live?.processing ? 'coming' : 'waiting';
  const [view, setView] = useUrlChoice<View>('view', VIEWS.map((v) => v[0]), start);
  const [said, setSaid] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setSaid('');
    setErr('');
  }, [view]);

  if (!snap) return <div className="page requests-page" aria-busy="true" />;
  const seerr = snap.sources.overseerr;
  if (!seerr)
    return (
      <div className="page requests-page">
        <div className="page-head">
          <h1 className="page-title">{tr('Requests')}</h1>
        </div>
        <Empty>
          {tr('Overseerr or Jellyseerr is not set up.')} <ConnectOne sources={PAGE_SOURCES['/requests']} />
        </Empty>
      </div>
    );
  const counts = (seerr.data as SeerrData | null) ?? { pending: 0, processing: 0 };
  const badge: Partial<Record<View, number>> = { waiting: counts.pending, coming: counts.processing };

  return (
    <div className="page requests-page">
      <div className="page-head">
        <h1 className="page-title">{tr('Requests')}</h1>
      </div>

      <div className="page-toolbar">
        <div className="seg lib-views" role="group" aria-label={tr('Show')}>
          {VIEWS.filter(([v]) => !(ro && v === 'ask')).map(([v, label]) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {tr(label)}
              {!!badge[v] && <span className="dlp-count">{badge[v]}</span>}
            </button>
          ))}
        </div>
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

      {view === 'waiting' && <Waiting ro={ro} onSaid={setSaid} onErr={setErr} />}
      {view === 'coming' && <Coming />}
      {view === 'ask' && !ro && <Ask onSaid={setSaid} />}
    </div>
  );
}

function Title({ r }: { r: { title: string; year?: number; href?: string } }) {
  const inner = (
    <>
      {r.title}
      {r.year ? <span className="lib-year"> {r.year}</span> : null}
    </>
  );
  return r.href && r.href !== '#' ? (
    <a className="lib-title" href={r.href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <span className="lib-title">{inner}</span>
  );
}

function Meta({ r }: { r: SeerrRequest }) {
  return (
    <div className="dlp-meta">
      <span>{r.kind === 'tv' ? tr('TV show') : tr('Film')}</span>
      {r.seasons && <span>{seasons(r.seasons)}</span>}
      {r.is4k && <span>4K</span>}
      <span>{tr('{who}, {when}', { who: r.by, when: agoLong(r.at) })}</span>
    </div>
  );
}

function Total({ list, label }: { list: RequestList; label: string }) {
  return (
    <div className="lib-filter">
      <span className="lib-total">
        {label}
        {list.total > list.items.length ? `, ${tr('newest {n} here', { n: list.items.length })}` : ''}
      </span>
    </div>
  );
}

function Waiting({ ro, onSaid, onErr }: { ro: boolean; onSaid: (s: string) => void; onErr: (s: string) => void }) {
  const { data, err, reload } = useList<RequestList>('/api/requests/waiting');
  const [busy, setBusy] = useState<number | null>(null);

  async function act(r: SeerrRequest, action: 'approve' | 'decline') {
    setBusy(r.id);
    onSaid('');
    onErr('');
    try {
      await call(`/api/requests/${r.id}/${action}`, { method: 'POST', headers: ACTION });
      onSaid(action === 'approve' ? tr('Approved {title}. It’s on the way.', { title: r.title }) : tr('Declined {title}.', { title: r.title }));
      reload();
    } catch (e) {
      onErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {data && data.total > 0 && <Total list={data} label={tr('{n} waiting', { n: data.total })} />}
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : data.items.length === 0 ? (
        <Empty>{tr('Nothing waiting for approval.')}</Empty>
      ) : (
        <ul className="lib-list">
          {data.items.map((r) => (
            <Row
              key={r.id}
              art={r.art}
              title={r.title}
              actions={
                !ro && (
                  <>
                    <button type="button" className="button" disabled={busy === r.id} aria-label={tr('Approve {title}', { title: r.title })} onClick={() => void act(r, 'approve')}>
                      {tr('Approve')}
                    </button>
                    <HoldButton className="text-button" danger disabled={busy === r.id} label={tr('Decline {title}', { title: r.title })} hint={tr('Hold to decline')} onConfirm={() => void act(r, 'decline')}>
                      {tr('Decline')}
                    </HoldButton>
                  </>
                )
              }
            >
              <Title r={r} />
              <Meta r={r} />
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

function Coming() {
  const { data, err } = useList<RequestList>('/api/requests/coming');
  return (
    <>
      {data && data.total > 0 && <Total list={data} label={tr('{n} on the way', { n: data.total })} />}
      {err && <p className="crit-text">{err}</p>}
      {!data ? (
        !err && <div className="dlp-loading" aria-busy="true" />
      ) : data.items.length === 0 ? (
        <Empty>{tr('Nothing on the way.')}</Empty>
      ) : (
        <ul className="lib-list">
          {data.items.map((r) => (
            <Row key={r.id} art={r.art} title={r.title}>
              <Title r={r} />
              <Meta r={r} />
            </Row>
          ))}
        </ul>
      )}
    </>
  );
}

const STATE: Record<AskItem['state'], string> = {
  new: '',
  partial: msg('Some seasons here'),
  asked: msg('Waiting for approval'),
  coming: msg('On the way'),
  here: msg('Already here'),
  blocked: msg('Blocklisted'),
};

function Ask({ onSaid }: { onSaid: (s: string) => void }) {
  const [term, setTerm] = useState('');
  const [found, setFound] = useState<AskItem[] | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const id = (f: AskItem) => `${f.kind}:${f.key}`;

  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (!term.trim()) return;
    setBusy('find');
    setErr('');
    try {
      setFound(await call<AskItem[]>(`/api/requests/find?q=${encodeURIComponent(term.trim())}`));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function ask(f: AskItem) {
    setBusy(id(f));
    setErr('');
    onSaid('');
    try {
      await call('/api/requests/ask', { method: 'POST', headers: ACTION, body: JSON.stringify({ kind: f.kind, key: f.key }) });
      setAsked((s) => new Set(s).add(id(f)));
      onSaid(tr('Requested {title}.', { title: f.title }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <form className="dlp-add lib-find" onSubmit={(e) => void find(e)}>
        <input className="field" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder={tr('Film or show name')} aria-label={tr('Film or show name')} autoComplete="off" />
        <button type="submit" className="button" disabled={busy === 'find' || !term.trim()}>
          {busy === 'find' ? tr('Finding') : tr('Find')}
        </button>
      </form>
      {err && (
        <p className="crit-text" role="alert">
          {err}
        </p>
      )}
      {found &&
        (found.length === 0 ? (
          <Empty>{tr('Nothing by that name.')}</Empty>
        ) : (
          <ul className="lib-list">
            {found.map((f) => {
              const done = asked.has(id(f));
              const open = f.state === 'new' || f.state === 'partial';
              return (
                <Row
                  key={id(f)}
                  art={f.art}
                  title={f.title}
                  actions={
                    done ? (
                      <span className="lib-have">{tr('Requested')}</span>
                    ) : open ? (
                      <button type="button" className="button button-quiet" disabled={!!busy} onClick={() => void ask(f)}>
                        {f.state === 'partial' ? tr('Request the rest') : tr('Request')}
                      </button>
                    ) : (
                      <span className="lib-have">{tr(STATE[f.state])}</span>
                    )
                  }
                >
                  <Title r={f} />
                  <div className="dlp-meta">
                    <span>{f.kind === 'tv' ? tr('TV show') : tr('Film')}</span>
                    {f.state === 'partial' && !done && <span>{tr(STATE.partial)}</span>}
                  </div>
                  {f.overview && <p className="lib-overview">{f.overview}</p>}
                </Row>
              );
            })}
          </ul>
        ))}
    </>
  );
}
