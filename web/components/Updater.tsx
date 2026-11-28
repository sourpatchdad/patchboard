// Update from the UI: a press-and-hold button, one notice when an update
// waits, a compact action for list rows, and a live panel that follows the
// job: pull, recreate, wait for healthy. Any update that changed the image,
// failed or not, offers the previous image back, and keeps offering it in
// one line after you dismiss the panel.

import { HoldButton } from './Hold.tsx';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

/** What an update brings: loaded only for a container with one waiting. */
const UpdateNotes = lazy(() => import('./UpdateNotes.tsx'));
import { Link } from 'react-router-dom';
import type { UpdateJob } from '../../shared/types.ts';
import { agoLong, duration } from '../lib/format.ts';
import { useNow, useStore } from '../lib/store.tsx';

/** Running or waiting its turn: still to be followed, and nothing else should start. */
export const active = (j: UpdateJob | null | undefined): boolean => j?.status === 'running' || j?.status === 'queued';
import { Section } from './ui.tsx';
import { msg, t as tr, tx } from '../lib/i18n.ts';

const ACTION = { 'Content-Type': 'application/json', 'X-Patchboard': 'action' };

/** The newest job for this container, followed live while it runs. */
/** Jobs whose panel was dismissed, on this device: coming back shows the one line, not the panel again. */
const DISMISSED = 'pb-jobs-dismissed';
const dismissedJobs = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const rememberDismissed = (id: string) => {
  try {
    localStorage.setItem(DISMISSED, JSON.stringify([id, ...dismissedJobs().filter((x) => x !== id)].slice(0, 20)));
  } catch {
    // Private mode: it's dismissed for this visit.
  }
};

export function useUpdateJob(name: string) {
  const [job, setJob] = useState<UpdateJob | null>(null);
  const [error, setError] = useState('');
  /** Dismissed: the panel goes, the job stays known so it can still be undone. */
  const [hidden, setHidden] = useState(false);

  const follow = useCallback((id: string) => {
    const es = new EventSource(`/api/jobs/${id}`);
    es.onmessage = (m) => {
      const j = JSON.parse(m.data as string) as UpdateJob;
      setJob(j);
      if (!active(j)) es.close();
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => {
    let stop: (() => void) | undefined;
    setJob(null);
    setHidden(false);
    void (async () => {
      const j = (await (await fetch(`/api/containers/${encodeURIComponent(name)}/job`)).json()) as UpdateJob | null;
      if (!j) return;
      setJob(j);
      if (active(j)) stop = follow(j.id);
      else if (dismissedJobs().includes(j.id)) setHidden(true);
    })();
    return () => stop?.();
  }, [name, follow]);

  const post = async (url: string) => {
    setError('');
    setHidden(false);
    const res = await fetch(url, { method: 'POST', headers: ACTION });
    const body = (await res.json()) as UpdateJob & { error?: string };
    if (!res.ok) {
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    setJob(body);
    follow(body.id);
  };

  return {
    job: hidden ? null : job,
    /** The newest job, shown or dismissed. */
    last: job,
    error,
    start: () => post(`/api/containers/${encodeURIComponent(name)}/update`),
    rollback: (id: string) => post(`/api/jobs/${id}/rollback`),
    dismiss: () => {
      if (job) rememberDismissed(job.id);
      setHidden(true);
    },
  };
}

/** An update that put a different image in place: the old one can come back. */
export const undoable = (j: UpdateJob | null | undefined): j is UpdateJob =>
  !!j && j.kind === 'update' && j.status !== 'running' && !!j.from && j.from !== j.to && j.steps.find((s) => s.key === 'recreate')?.status !== 'waiting';

/** After the panel is dismissed: one line that keeps the way back. */
export function UpdateUndo({ job, onRollback }: { job: UpdateJob | null; onRollback: (id: string) => void }) {
  const { snap } = useStore();
  const now = useNow(60_000);
  if (!undoable(job) || job.status !== 'done' || snap?.readOnly) return null;
  return (
    <p className="update-notice">
      {tx('Updated {when} from {image}', { when: agoLong(job.finishedAt ?? job.startedAt, now), image: <code>{job.from}</code> })}{' '}
      <HoldButton className="text-button" hint={tr('Hold to roll back')} label={tr('Roll back to {image}', { image: job.from ?? '' })} onConfirm={() => onRollback(job.id)}>
        {tr('Roll back')}
      </HoldButton>
    </p>
  );
}

/** Update, as a press and hold: recreating takes the container down for a moment. It stands out when an update waits. */
/** `busy`: this update is running. `locked`: something else is (a start, a stop), so it waits without claiming to update. */
export function UpdateButton({ busy, busyLabel = 'Updating...', locked = false, onStart, waiting = false }: { name: string; busy: boolean; busyLabel?: string; locked?: boolean; onStart: () => void; waiting?: boolean }) {
  return (
    <HoldButton className={waiting ? 'button board-save' : 'button button-quiet'} disabled={busy || locked} hint={tr('Hold to update')} onConfirm={onStart}>
      {busy ? tr(busyLabel) : tr('Update')}
    </HoldButton>
  );
}

/** One line under a container's state when it has an update waiting, or a newer copy already pulled. */
export function UpdateNotice({ name, stale, busy = false }: { name: string; stale?: boolean; busy?: boolean }) {
  const { snap } = useStore();
  const now = useNow(60_000);
  const u = snap?.updates[name];
  const ro = !!snap?.readOnly;
  if (stale) return <p className="update-notice">{tr('A newer copy is downloaded and this container still runs the old one.')}{!ro && ` ${tr('Update switches it over.')}`}</p>;
  if (!u) return null;
  return (
    <>
    <p className="update-notice">
      {tr('Update available, found {when}.', { when: agoLong(u.at, now) })}
      {u.link && u.link !== '#' && (
        <a href={u.link} target="_blank" rel="noreferrer">
          {tr('What changed')}
        </a>
      )}
      {/* Not while an update runs: it would clear the mark mid-way. */}
      {!ro && !busy && (
        <button
          type="button"
          className="text-button"
          title={tr('Clear the mark if you already run the newest image')}
          onClick={() => void fetch(`/api/updates/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { 'X-Patchboard': 'action' } })}
        >
          {tr('Dismiss')}
        </button>
      )}
    </p>
    <Suspense fallback={null}>
      <UpdateNotes name={name} />
    </Suspense>
    </>
  );
}

/** Each step in a word or two, for a row with little room. */
const SHORT: Record<string, string> = { pull: msg('Pulling'), recreate: msg('Recreating'), healthy: msg('Checking health'), tag: msg('Rolling back') };

/** Where a job is, in words: what it waits for, or its step with a running clock. */
export function JobProgress({ job }: { job: UpdateJob }) {
  const now = useNow(1000);
  if (job.status === 'queued') return <>{job.waitingFor ? tr('Waiting for {name} to finish', { name: job.waitingFor }) : tr('Waiting its turn')}</>;
  const at = job.steps.findIndex((s) => s.status === 'running');
  const step = job.steps[at];
  const label = step ? tr(SHORT[step.key] ?? step.label) : tr('Updating');
  const secs = Math.max(0, Math.floor((now - job.startedAt) / 1000));
  return (
    <>
      <span title={step ? tr('{step}, {n} of {total}', { step: tr(step.label), n: at + 1, total: job.steps.length }) : undefined}>{label}</span>{' '}
      <span className="mono">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`}</span>
    </>
  );
}

/** Update from a list row: the button, then the step it's on, then how it ended. */
export function RowUpdate({ name }: { name: string }) {
  const u = useUpdateJob(name);
  const j = u.job;
  if (j && active(j))
    return (
      <span className="row-update-note" role="status">
        <JobProgress job={j} />
      </span>
    );
  if (j?.status === 'done') return <span className="row-update-note ok-text">{tr('Updated')}</span>;
  if (j?.status === 'failed')
    return (
      <Link to={`/c/${encodeURIComponent(name)}`} className="row-update-note crit-text">
        {tr('Failed. Open it')}
      </Link>
    );
  return (
    <>
      {/* The reason in words, not a tooltip a phone never shows. */}
      {u.error && (
        <Link to={`/c/${encodeURIComponent(name)}`} className="row-update-note crit-text" role="alert">
          {u.error}
        </Link>
      )}
      <UpdateButton name={name} busy={false} waiting onStart={() => void u.start()} />
    </>
  );
}

const MARK: Record<string, string> = { waiting: '', running: '', done: '✓', failed: '✕', skipped: '–' };

export function UpdatePanel({ job, error, onRollback, onDismiss }: { job: UpdateJob | null; error: string; onRollback: (id: string) => void; onDismiss: () => void }) {
  if (!job && !error) return null;
  if (!job) {
    return (
      <Section title="Update" className="update-panel">
        <p className="crit-text update-error">{error}</p>
      </Section>
    );
  }
  const title = job.kind === 'rollback' ? msg('Rollback') : msg('Update');
  const took = job.finishedAt ? duration(job.finishedAt - job.startedAt) : '';
  const rollback = job.kind === 'rollback';
  const summary =
    job.status === 'queued'
      ? `${job.waitingFor ? tr('Waiting for {name} to finish', { name: job.waitingFor }) : tr('Waiting its turn')}. ${tr('It starts on its own.')}`
      : job.status === 'running'
      ? rollback
        ? tr('Rolling back...')
        : tr('Updating...')
      : job.status === 'done'
        ? job.from === job.to
          ? tr('Up to date. Checked in {time}.', { time: took })
          : rollback
            ? tr('Rolled back in {time}.', { time: took })
            : tr('Updated in {time}.', { time: took })
        : rollback
          ? tr('Rollback failed: {error}', { error: job.error ?? tr('unknown error') })
          : tr('Update failed: {error}', { error: job.error ?? tr('unknown error') });

  return (
    <Section title={title} className={`update-panel is-${job.status}`} count={job.from && job.to && job.from !== job.to ? `${job.from} → ${job.to}` : undefined}>
      <p className={`update-summary ${job.status === 'failed' ? 'crit-text' : ''}`} role="status">{summary}</p>
      <ol className="update-steps">
        {job.steps.map((s) => (
          <li key={s.key} data-status={s.status}>
            <span className="update-mark" aria-hidden>
              {MARK[s.status]}
            </span>
            <span className="update-label">{s.label}</span>
            {s.note && <span className="update-note-text">{s.note}</span>}
          </li>
        ))}
      </ol>
      {job.log.length > 0 && (
        <details className="update-log" open={job.status === 'failed'}>
          <summary>{tr('Output')}</summary>
          <div className="logs-out wrap">
            {job.log.map((l, i) => (
              <div key={i} className="ll">
                {l}
              </div>
            ))}
          </div>
        </details>
      )}
      <div className="update-foot">
        {/* Only once the container was recreated: a failed pull changed nothing.
            After a good update it's the quiet choice; after a failed one, the first. */}
        {undoable(job) && (
          <HoldButton className={job.status === 'failed' ? 'button' : 'button button-quiet'} hint={tr('Hold to roll back')} onConfirm={() => onRollback(job.id)}>
            {tr('Roll back to {image}', { image: job.from ?? '' })}
          </HoldButton>
        )}
        {!active(job) && (
          <button type="button" className="text-button" onClick={onDismiss}>
            {tr('Dismiss')}
          </button>
        )}
        {error && <span className="crit-text">{error}</span>}
      </div>
    </Section>
  );
}

/** Update Patchboard itself: the same job as its container page, followed in one line. */
export function SelfUpdate({ name, waiting }: { name: string; waiting: boolean }) {
  const u = useUpdateJob(name);
  const j = u.job;
  const { snap } = useStore();
  const version = snap?.self?.version;
  // A helper recreates Patchboard after this job ends, so "done" means it's
  // restarting. Once the new server answers with another version, load it.
  const handedOff = j?.status === 'done' && !!j.to && j.from !== j.to && j.steps.find((s) => s.key === 'healthy')?.status === 'skipped';
  const [from, setFrom] = useState<string | undefined>();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!handedOff) return;
    setFrom((f) => f ?? version);
    const t = window.setTimeout(() => setSlow(true), 120_000);
    return () => window.clearTimeout(t);
  }, [handedOff]);
  useEffect(() => {
    if (from && version && version !== from) location.reload();
  }, [from, version]);
  if (handedOff)
    return (
      <span role="status">
        {slow ? (
          <>
            {tr('Still restarting after two minutes.')}{' '}
            <button type="button" className="text-button" onClick={() => location.reload()}>
              {tr('Reload')}
            </button>
          </>
        ) : (
          tr('Restarting on the new image. This page reloads when it is back.')
        )}
      </span>
    );
  if (j && active(j)) return <span role="status"><JobProgress job={j} /></span>;
  // A newer image marked after the last job ended outdates that job's result.
  const markedAt = snap?.updates[name]?.at ?? 0;
  if (j?.finishedAt && markedAt > j.finishedAt) return <UpdateButton name={name} busy={false} waiting={waiting} onStart={() => void u.start()} />;
  if (j?.status === 'done' && j.to && j.from !== j.to) return <span>Updated.</span>;
  if (j?.status === 'failed') return <Link to={`/c/${encodeURIComponent(name)}`} className="crit-text">{tr('Update failed. Open it')}</Link>;
  if (j?.status === 'done' && j.steps.find((s) => s.key === 'pull')?.note === 'Already the newest image') return <span>{tr('Already the newest image.')}</span>;
  return (
    <>
      <UpdateButton name={name} busy={false} waiting={waiting} onStart={() => void u.start()} />
      {u.error && <span className="crit-text" role="alert">{u.error}</span>}
    </>
  );
}
